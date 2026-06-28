import type { MetadataRoute } from 'next';

/**
 * PWA manifest — makes Asha installable to the desktop ("Install app") and
 * launchable as a standalone window. Next serves this at /manifest.webmanifest
 * and injects the <link rel="manifest"> automatically.
 *
 * Icons are SVG (crisp at any size, `sizes: "any"`). The maskable variant is
 * full-bleed so platform masks don't clip the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Asha — Container Streaming Platform',
    short_name: 'Asha',
    description:
      'Self-hosted container streaming, VDI and DaaS — launch desktops and apps from your browser or install Asha as a desktop app.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#1a1a2e',
    theme_color: '#1a1a2e',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/asha-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My Workspaces', short_name: 'Workspaces', url: '/' },
      { name: 'Dashboard', short_name: 'Dashboard', url: '/dashboard' },
      { name: 'Updates', short_name: 'Updates', url: '/developer/updates' },
    ],
  };
}
