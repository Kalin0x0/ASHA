import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * Extra origins the browser may connect to, derived from the configured API/WS
 * URLs. Returns their origin only (never a path), and silently skips anything
 * unparseable so a malformed env var cannot produce a broken header.
 */
function connectOrigins(): string[] {
  const out = new Set<string>();
  for (const raw of [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_WS_URL]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      out.add(u.origin);
      // A WSS endpoint is usually the same host over the ws(s) scheme.
      out.add(`${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`);
    } catch {
      /* not a URL — ignore */
    }
  }
  return [...out];
}

// Content-Security-Policy for the Asha web app.
// frame-src is intentionally permissive (https:) because the session viewer
// embeds KasmVNC / remote-desktop iframes from operator-configured domains.
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // Next.js inlines small hydration scripts, so 'unsafe-inline' stays. But
  // 'unsafe-eval' is only needed by the dev-mode React refresh runtime — leaving
  // it on in production removed the main thing CSP buys you against an injected
  // script. The nonce approach would let us drop 'unsafe-inline' too, but that
  // needs middleware rewrites; this is the part that costs nothing.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  // API + WebSocket connections. Same-origin by default; an operator running the
  // API on a separate host sets NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL and
  // those origins are added below. Previously this was a blanket `https:`, which
  // let any injected script exfiltrate to an arbitrary host.
  ['connect-src', "'self'", ...connectOrigins()].join(' '),
  // Remote-desktop iframes are served from operator-configured origins
  "frame-src 'self' https:",
  "frame-ancestors 'none'",
  "font-src 'self' data:",
  "object-src 'none'",
  // PWA: the service worker + web app manifest are same-origin.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
]
  .join('; ')
  .trim();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // frame-ancestors in CSP replaces X-Frame-Options in modern browsers;
  // keep both for legacy compatibility.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable features not used by the app
  // Explicitly grant clipboard to this origin (self) so the remote-desktop
  // viewers — and the same-origin KasmVNC <iframe> (which forwards it via its
  // allow="clipboard-read; clipboard-write") — can read/write the OS clipboard.
  { key: 'Permissions-Policy', value: 'clipboard-read=(self), clipboard-write=(self), camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // HSTS: 1 year, includeSubDomains — only sent over HTTPS by the browser
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: csp },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is run explicitly via `pnpm lint`; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'kasm-static-content.s3.amazonaws.com' },
    ],
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // The service worker must not be cached long, and may control the root.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
