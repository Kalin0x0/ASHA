import type { NextConfig } from 'next';

// Content-Security-Policy for the Chista web app.
// frame-src is intentionally permissive (https:) because the session viewer
// embeds KasmVNC / remote-desktop iframes from operator-configured domains.
const csp = [
  "default-src 'self'",
  // Next.js inlines small scripts for hydration; RSC needs 'unsafe-eval' in dev.
  // In production the nonce approach is preferable but requires middleware rewrites;
  // 'unsafe-inline' is acceptable here given the tight default-src.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  // API + WebSocket connections
  "connect-src 'self' ws: wss: https:",
  // Remote-desktop iframes are served from operator-configured origins
  "frame-src 'self' https:",
  "frame-ancestors 'none'",
  "font-src 'self' data:",
  "object-src 'none'",
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
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
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
    ];
  },
};

export default nextConfig;
