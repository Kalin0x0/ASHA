import type { MetadataRoute } from 'next';

/**
 * PWA manifest — makes Asha installable to the desktop ("Install app") and
 * launchable as a standalone window. Next serves this at /manifest.webmanifest
 * and injects the <link rel="manifest"> automatically.
 *
 * PNG icons at the sizes installers ask for. The maskable variant keeps the
 * mark inside its safe zone so platform masks (circle, squircle) don't clip it.
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
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My Workspaces', short_name: 'Workspaces', url: '/' },
      { name: 'Dashboard', short_name: 'Dashboard', url: '/dashboard' },
      { name: 'Updates', short_name: 'Updates', url: '/developer/updates' },
    ],
  };
}
