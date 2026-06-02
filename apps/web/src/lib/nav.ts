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
  /** Built and live in Phase 1. Others render a branded "coming soon" surface. */
  built?: boolean;
  phase?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, built: true }],
  },
  {
    label: 'Workspaces',
    items: [
      { label: 'Catalog', href: '/workspaces', icon: AppWindow, built: true },
      { label: 'Images', href: '/workspaces/images', icon: Container, built: true },
      { label: 'Registry', href: '/registry', icon: Boxes, built: true },
    ],
  },
  {
    label: 'Sessions',
    items: [
      { label: 'Live Sessions', href: '/sessions', icon: MonitorPlay, built: true },
      { label: 'History', href: '/sessions/history', icon: History, built: true },
      { label: 'Recordings', href: '/sessions/recordings', icon: Film, built: true },
      { label: 'Staging', href: '/sessions/staging', icon: Layers, built: true },
      { label: 'Casting', href: '/sessions/casting', icon: Cast, built: true },
      { label: 'Sharing', href: '/sessions/sharing', icon: Share2, built: true },
    ],
  },
  {
    label: 'Access',
    items: [
      { label: 'Users', href: '/users', icon: Users, built: true },
      { label: 'Groups', href: '/groups', icon: UsersRound, built: true },
      { label: 'Roles', href: '/roles', icon: ShieldCheck, built: true },
      { label: 'Authentication', href: '/authentication', icon: KeyRound, built: true },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'Zones', href: '/infrastructure/zones', icon: Globe, built: true },
      { label: 'Agents', href: '/infrastructure/agents', icon: Server, built: true },
      { label: 'Servers', href: '/infrastructure/servers', icon: HardDrive, built: true },
      { label: 'Server Pools', href: '/infrastructure/server-pools', icon: Network, built: true },
      { label: 'AutoScale', href: '/infrastructure/autoscale', icon: Gauge, built: true },
      { label: 'VM Providers', href: '/infrastructure/vm-providers', icon: Cloud, built: true },
      { label: 'DNS Providers', href: '/infrastructure/dns-providers', icon: Route, built: true },
    ],
  },
  {
    label: 'Storage',
    items: [
      { label: 'Storage Mappings', href: '/storage/mappings', icon: FolderTree, built: true },
      { label: 'Persistent Profiles', href: '/storage/profiles', icon: FolderCog, built: true },
      { label: 'Volume Mappings', href: '/storage/volumes', icon: Database, built: true },
      { label: 'File Mappings', href: '/storage/file-mappings', icon: FileCog, built: true },
    ],
  },
  {
    label: 'Connectivity',
    items: [
      { label: 'Connection Proxies', href: '/connectivity/proxies', icon: Cable, built: true },
      { label: 'Web Filtering', href: '/connectivity/web-filtering', icon: Filter, built: true },
      { label: 'Browser Isolation', href: '/connectivity/browser-isolation', icon: ShieldHalf, built: true },
      { label: 'Egress', href: '/connectivity/egress', icon: DoorOpen, built: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'General', href: '/settings/general', icon: Settings2, built: true },
      { label: 'Branding', href: '/settings/branding', icon: Palette, built: true },
      { label: 'Banners', href: '/settings/banners', icon: Flag, built: true },
      { label: 'Licensing', href: '/settings/licensing', icon: BadgeCheck, built: true },
      { label: 'Database', href: '/settings/database', icon: DatabaseBackup, built: true },
      { label: 'Config Import/Export', href: '/settings/config', icon: FileJson, built: true },
    ],
  },
  {
    label: 'Observability',
    items: [
      { label: 'Reporting', href: '/observability/reporting', icon: TrendingUp, built: true },
      { label: 'Audit Log', href: '/observability/audit-log', icon: ScrollText, built: true },
      { label: 'Metrics', href: '/observability/metrics', icon: Activity, built: true },
      { label: 'Log Forwarding', href: '/observability/log-forwarding', icon: Send, built: true },
    ],
  },
  {
    label: 'Developer',
    items: [
      { label: 'API Keys', href: '/developer/api-keys', icon: KeyRound, built: true },
      { label: 'Webhooks', href: '/developer/webhooks', icon: Webhook, built: true },
      { label: 'API Docs', href: '/developer/api-docs', icon: BookOpen, phase: 1 },
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
