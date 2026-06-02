import {
  Activity,
  AppWindow,
  BadgeCheck,
  BookOpen,
  Boxes,
  Cable,
  Cast,
  Cloud,
  Container,
  Database,
  DatabaseBackup,
  DoorOpen,
  FileCog,
  FileJson,
  Fingerprint,
  Film,
  Filter,
  Flag,
  FolderCog,
  FolderTree,
  Gauge,
  Globe,
  HardDrive,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  MonitorPlay,
  Network,
  Palette,
  Route,
  ScrollText,
  Send,
  Server,
  Settings2,
  Share2,
  ShieldCheck,
  ShieldHalf,
  TrendingUp,
  Users,
  UsersRound,
  Webhook,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Workspaces',
    items: [
      { label: 'Catalog', href: '/workspaces', icon: AppWindow },
      { label: 'Images', href: '/workspaces/images', icon: Container },
      { label: 'Registry', href: '/registry', icon: Boxes },
    ],
  },
  {
    label: 'Sessions',
    items: [
      { label: 'Live Sessions', href: '/sessions', icon: MonitorPlay },
      { label: 'History', href: '/sessions/history', icon: History },
      { label: 'Recordings', href: '/sessions/recordings', icon: Film },
      { label: 'Staging', href: '/sessions/staging', icon: Layers },
      { label: 'Casting', href: '/sessions/casting', icon: Cast },
      { label: 'Sharing', href: '/sessions/sharing', icon: Share2 },
    ],
  },
  {
    label: 'Access',
    items: [
      { label: 'Users', href: '/users', icon: Users },
      { label: 'Groups', href: '/groups', icon: UsersRound },
      { label: 'Roles', href: '/roles', icon: ShieldCheck },
      { label: 'Authentication', href: '/authentication', icon: KeyRound },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'Zones', href: '/infrastructure/zones', icon: Globe },
      { label: 'Agents', href: '/infrastructure/agents', icon: Server },
      { label: 'Servers', href: '/infrastructure/servers', icon: HardDrive },
      { label: 'Server Pools', href: '/infrastructure/server-pools', icon: Network },
      { label: 'AutoScale', href: '/infrastructure/autoscale', icon: Gauge },
      { label: 'VM Providers', href: '/infrastructure/vm-providers', icon: Cloud },
      { label: 'DNS Providers', href: '/infrastructure/dns-providers', icon: Route },
    ],
  },
  {
    label: 'Storage',
    items: [
      { label: 'Storage Mappings', href: '/storage/mappings', icon: FolderTree },
      { label: 'Persistent Profiles', href: '/storage/profiles', icon: FolderCog },
      { label: 'Volume Mappings', href: '/storage/volumes', icon: Database },
      { label: 'File Mappings', href: '/storage/file-mappings', icon: FileCog },
    ],
  },
  {
    label: 'Connectivity',
    items: [
      { label: 'Connection Proxies', href: '/connectivity/proxies', icon: Cable },
      { label: 'Web Filtering', href: '/connectivity/web-filtering', icon: Filter },
      { label: 'Browser Isolation', href: '/connectivity/browser-isolation', icon: ShieldHalf },
      { label: 'Egress', href: '/connectivity/egress', icon: DoorOpen },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'General', href: '/settings/general', icon: Settings2 },
      { label: 'Security', href: '/settings/security', icon: Fingerprint },
      { label: 'Branding', href: '/settings/branding', icon: Palette },
      { label: 'Banners', href: '/settings/banners', icon: Flag },
      { label: 'Licensing', href: '/settings/licensing', icon: BadgeCheck },
      { label: 'Database', href: '/settings/database', icon: DatabaseBackup },
      { label: 'Config Import/Export', href: '/settings/config', icon: FileJson },
    ],
  },
  {
    label: 'Observability',
    items: [
      { label: 'Reporting', href: '/observability/reporting', icon: TrendingUp },
      { label: 'Audit Log', href: '/observability/audit-log', icon: ScrollText },
      { label: 'Metrics', href: '/observability/metrics', icon: Activity },
      { label: 'Log Forwarding', href: '/observability/log-forwarding', icon: Send },
    ],
  },
  {
    label: 'Developer',
    items: [
      { label: 'API Keys', href: '/developer/api-keys', icon: KeyRound },
      { label: 'Webhooks', href: '/developer/webhooks', icon: Webhook },
      { label: 'API Docs', href: '/developer/api-docs', icon: BookOpen },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === pathname) return { group, item };
    }
  }
  // longest-prefix match for detail routes
  let best: { group: NavGroup; item: NavItem } | undefined;
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname.startsWith(item.href) && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}
