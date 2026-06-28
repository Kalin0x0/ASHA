import type { ApiMarketplaceEntry, ApiRegistry } from '@/lib/api/endpoints';

/**
 * Mock seed for the workspace registry / image marketplace (demo mode). Mirrors
 * a Kasm-style catalog: several registry sources, each contributing installable
 * images with icons, sizes and categories. Icons resolve via `resolveAppIcon`
 * from the name/image, so recognised apps show brand logos.
 */
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const REGISTRY_SEED: ApiRegistry[] = [
  {
    id: 'reg-kasm',
    name: 'Kasm Technologies',
    url: 'https://registry.kasmweb.com/1.0/',
    type: 'FIRST_PARTY',
    enabled: true,
    lastSyncedAt: hoursAgo(3),
  },
  {
    id: 'reg-lsio',
    name: 'LinuxServer.io',
    url: 'https://fleet.linuxserver.io',
    type: 'THIRD_PARTY',
    enabled: true,
    lastSyncedAt: hoursAgo(9),
  },
  {
    id: 'reg-asha',
    name: 'Asha Official',
    url: 'https://registry.asha.io/index.json',
    type: 'FIRST_PARTY',
    enabled: true,
    lastSyncedAt: hoursAgo(28),
  },
];

type RegId = 'reg-kasm' | 'reg-lsio' | 'reg-asha';
type Seed = [name: string, friendly: string, image: string, cats: string[], gib: number, reg: RegId, desc: string];

// gib → MB; rounded for display ("9.0 GiB").
const RAW: Seed[] = [
  // ── Browsers ──────────────────────────────────────────────────────────────
  ['firefox', 'Firefox', 'kasmweb/firefox:1.16.0', ['Browsers'], 2.8, 'reg-kasm', 'Isolated Firefox browser session.'],
  ['chrome', 'Google Chrome', 'kasmweb/chrome:1.16.0', ['Browsers'], 2.7, 'reg-kasm', 'Isolated Chrome browser session.'],
  ['chromium', 'Chromium', 'kasmweb/chromium:1.16.0', ['Browsers'], 2.7, 'reg-kasm', 'Open-source Chromium browser.'],
  ['brave', 'Brave', 'kasmweb/brave:1.16.0', ['Browsers'], 2.8, 'reg-kasm', 'Privacy-focused Brave browser.'],
  ['edge', 'Microsoft Edge', 'kasmweb/edge:1.16.0', ['Browsers'], 2.9, 'reg-kasm', 'Microsoft Edge browser.'],
  ['tor-browser', 'Tor Browser', 'kasmweb/tor-browser:1.16.0', ['Browsers', 'Security'], 2.0, 'reg-kasm', 'Non-attributable research browsing.'],
  // ── Desktops / distros ────────────────────────────────────────────────────
  ['ubuntu-jammy', 'Ubuntu Desktop', 'kasmweb/ubuntu-jammy-desktop:1.16.0', ['Desktops'], 4.0, 'reg-kasm', 'Full Ubuntu XFCE desktop.'],
  ['debian-bookworm', 'Debian Bookworm', 'kasmweb/debian-bookworm-desktop:1.16.0', ['Desktops'], 7.8, 'reg-kasm', 'Debian 12 desktop environment.'],
  ['fedora-41', 'Fedora 41', 'kasmweb/fedora-41-desktop:1.16.0', ['Desktops'], 8.5, 'reg-kasm', 'Fedora 41 desktop.'],
  ['almalinux-9', 'AlmaLinux 9', 'kasmweb/almalinux-9-desktop:1.16.0', ['Desktops'], 7.8, 'reg-kasm', 'AlmaLinux 9 desktop.'],
  ['opensuse-leap-15', 'openSUSE Leap 15', 'kasmweb/opensuse-leap-15-desktop:1.16.0', ['Desktops'], 5.8, 'reg-kasm', 'openSUSE Leap 15 desktop.'],
  ['oracle-linux-9', 'Oracle Linux 9', 'kasmweb/oracle-linux-9-desktop:1.16.0', ['Desktops'], 8.1, 'reg-kasm', 'Oracle Linux 9 desktop.'],
  ['alpine-321', 'Alpine 3.21', 'kasmweb/alpine-321-desktop:1.16.0', ['Desktops'], 4.9, 'reg-kasm', 'Lightweight Alpine 3.21 desktop.'],
  // ── Development ───────────────────────────────────────────────────────────
  ['vs-code', 'VS Code', 'kasmweb/vs-code:1.16.0', ['Development'], 4.1, 'reg-kasm', 'Cloud development environment.'],
  ['postman', 'Postman', 'kasmweb/postman:1.16.0', ['Development'], 3.1, 'reg-kasm', 'API development workspace.'],
  ['insomnia', 'Insomnia', 'kasmweb/insomnia:1.16.0', ['Development'], 2.8, 'reg-kasm', 'REST & GraphQL API client.'],
  ['cuda-dev', 'CUDA Development', 'kasmweb/cuda-dev:1.16.0', ['Development'], 10.9, 'reg-kasm', 'GPU CUDA development desktop.'],
  ['filezilla', 'FileZilla', 'kasmweb/filezilla:1.16.0', ['Productivity'], 2.4, 'reg-kasm', 'FTP/SFTP file transfer.'],
  // ── Creative / multimedia ─────────────────────────────────────────────────
  ['blender', 'Blender', 'kasmweb/blender:1.16.0', ['Creative'], 3.7, 'reg-kasm', 'GPU-accelerated 3D suite.'],
  ['gimp', 'GIMP', 'kasmweb/gimp:1.16.0', ['Creative'], 2.5, 'reg-kasm', 'Image editing workspace.'],
  ['inkscape', 'Inkscape', 'kasmweb/inkscape:1.16.0', ['Creative'], 2.7, 'reg-kasm', 'Vector graphics editor.'],
  ['audacity', 'Audacity', 'kasmweb/audacity:1.16.0', ['Multimedia'], 2.5, 'reg-kasm', 'Audio recording & editing.'],
  ['pinta', 'Pinta', 'kasmweb/pinta:1.16.0', ['Creative'], 3.1, 'reg-kasm', 'Simple drawing & paint tool.'],
  // ── Productivity / office ─────────────────────────────────────────────────
  ['libre-office', 'LibreOffice', 'kasmweb/libre-office:1.16.0', ['Productivity'], 3.4, 'reg-kasm', 'Office productivity suite.'],
  ['only-office', 'OnlyOffice', 'kasmweb/only-office:1.16.0', ['Productivity'], 3.4, 'reg-kasm', 'OnlyOffice document suite.'],
  ['obsidian', 'Obsidian', 'kasmweb/obsidian:1.16.0', ['Productivity'], 3.2, 'reg-kasm', 'Markdown knowledge base.'],
  // ── Communication / games ─────────────────────────────────────────────────
  ['discord', 'Discord', 'kasmweb/discord:1.16.0', ['Communication'], 2.6, 'reg-kasm', 'Voice, video & text chat.'],
  ['doom', 'Doom', 'kasmweb/doom:1.16.0', ['Games'], 2.4, 'reg-kasm', 'Classic Doom in the browser.'],
  ['minetest', 'Minetest', 'kasmweb/minetest:1.16.0', ['Games'], 2.4, 'reg-kasm', 'Open-source voxel sandbox.'],
  // ── Security ──────────────────────────────────────────────────────────────
  ['kali-rolling', 'Kali Linux', 'kasmweb/kali-rolling-desktop:1.16.0', ['Security', 'Desktops'], 8.2, 'reg-kasm', 'Security testing desktop.'],
  ['parrot-os-6', 'Parrot OS 6', 'kasmweb/parrot-os-6-desktop:1.16.0', ['Security'], 17.2, 'reg-kasm', 'Parrot security desktop.'],
  ['maltego', 'Maltego', 'kasmweb/maltego:1.16.0', ['Security'], 3.2, 'reg-kasm', 'OSINT link analysis.'],
  ['nessus', 'Nessus', 'kasmweb/nessus:1.16.0', ['Security'], 5.5, 'reg-kasm', 'Vulnerability scanning.'],
  // ── LinuxServer.io ────────────────────────────────────────────────────────
  ['plex', 'Plex', 'lscr.io/linuxserver/plex:latest', ['Media'], 1.2, 'reg-lsio', 'Plex media server.'],
  ['jellyfin', 'Jellyfin', 'lscr.io/linuxserver/jellyfin:latest', ['Media'], 1.4, 'reg-lsio', 'Free software media system.'],
  ['qbittorrent', 'qBittorrent', 'lscr.io/linuxserver/qbittorrent:latest', ['Productivity'], 0.4, 'reg-lsio', 'BitTorrent client.'],
  ['nextcloud', 'Nextcloud', 'lscr.io/linuxserver/nextcloud:latest', ['Productivity'], 0.7, 'reg-lsio', 'Self-hosted file sync & share.'],
  ['heimdall', 'Heimdall', 'lscr.io/linuxserver/heimdall:latest', ['Productivity'], 0.3, 'reg-lsio', 'Application dashboard.'],
  // ── Asha Official ───────────────────────────────────────────────────────
  ['asha-terminal', 'Asha Terminal', 'asha/terminal:1.0.0', ['Development'], 0.9, 'reg-asha', 'Hardened Ubuntu terminal.'],
  ['asha-desktop', 'Asha Desktop', 'asha/desktop:1.0.0', ['Desktops'], 3.0, 'reg-asha', 'Branded Asha XFCE desktop.'],
];

const REG_BY_ID = new Map(REGISTRY_SEED.map((r) => [r.id, r] as const));
const INSTALLED = new Set(['firefox', 'vs-code']); // → "Installed: 2"

export const MARKETPLACE_SEED: ApiMarketplaceEntry[] = RAW.map(([name, friendly, image, cats, gib, reg, desc]) => {
  const r = REG_BY_ID.get(reg)!;
  return {
    id: `mk-${name}`,
    name,
    friendlyName: friendly,
    description: desc,
    dockerImage: image,
    iconUrl: null, // resolved client-side from name/image via resolveAppIcon
    categories: cats,
    installed: INSTALLED.has(name),
    sizeMb: Math.round(gib * 1024),
    registry: { name: r.name, type: r.type },
  };
});

/** Per-registry installable counts (for the registries list). */
export function registryEntryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [, , , , , reg] of RAW) counts[reg] = (counts[reg] ?? 0) + 1;
  return counts;
}
