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
      { label: 'Registry', href: '/registry', icon: Boxes, phase: 3 },
    ],
  },
  {
    label: 'Sessions',
    items: [
      { label: 'Live Sessions', href: '/sessions', icon: MonitorPlay, built: true },
      { label: 'History', href: '/sessions/history', icon: History, built: true },
      { label: 'Recordings', href: '/sessions/recordings', icon: Film, built: true },
      { label: 'Staging', href: '/sessions/staging', icon: Layers, phase: 3 },
      { label: 'Casting', href: '/sessions/casting', icon: Cast, phase: 3 },
      { label: 'Sharing', href: '/sessions/sharing', icon: Share2, built: true },
    ],
  },
  {
    label: 'Access',
    items: [
      { label: 'Users', href: '/users', icon: Users, built: true },
      { label: 'Groups', href: '/groups', icon: UsersRound, built: true },
      { label: 'Roles', href: '/roles', icon: ShieldCheck, built: true },
      { label: 'Authentication', href: '/authentication', icon: KeyRound, phase: 3 },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'Zones', href: '/infrastructure/zones', icon: Globe, phase: 3 },
      { label: 'Agents', href: '/infrastructure/agents', icon: Server, built: true },
      { label: 'Servers', href: '/infrastructure/servers', icon: HardDrive, phase: 2 },
      { label: 'Server Pools', href: '/infrastructure/server-pools', icon: Network, phase: 3 },
      { label: 'AutoScale', href: '/infrastructure/autoscale', icon: Gauge, phase: 3 },
      { label: 'VM Providers', href: '/infrastructure/vm-providers', icon: Cloud, phase: 3 },
      { label: 'DNS Providers', href: '/infrastructure/dns-providers', icon: Route, phase: 3 },
    ],
  },
  {
    label: 'Storage',
    items: [
      { label: 'Storage Mappings', href: '/storage/mappings', icon: FolderTree, phase: 4 },
      { label: 'Persistent Profiles', href: '/storage/profiles', icon: FolderCog, phase: 2 },
      { label: 'Volume Mappings', href: '/storage/volumes', icon: Database, phase: 2 },
      { label: 'File Mappings', href: '/storage/file-mappings', icon: FileCog, phase: 2 },
    ],
  },
  {
    label: 'Connectivity',
    items: [
      { label: 'Connection Proxies', href: '/connectivity/proxies', icon: Cable, phase: 2 },
      { label: 'Web Filtering', href: '/connectivity/web-filtering', icon: Filter, phase: 4 },
      { label: 'Browser Isolation', href: '/connectivity/browser-isolation', icon: ShieldHalf, phase: 4 },
      { label: 'Egress', href: '/connectivity/egress', icon: DoorOpen, phase: 4 },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'General', href: '/settings/general', icon: Settings2, phase: 2 },
      { label: 'Branding', href: '/settings/branding', icon: Palette, phase: 4 },
      { label: 'Banners', href: '/settings/banners', icon: Flag, phase: 3 },
      { label: 'Licensing', href: '/settings/licensing', icon: BadgeCheck, phase: 3 },
      { label: 'Database', href: '/settings/database', icon: DatabaseBackup, phase: 3 },
      { label: 'Config Import/Export', href: '/settings/config', icon: FileJson, phase: 3 },
    ],
  },
  {
    label: 'Observability',
    items: [
      { label: 'Reporting', href: '/observability/reporting', icon: TrendingUp, phase: 3 },
      { label: 'Audit Log', href: '/observability/audit-log', icon: ScrollText, phase: 3 },
      { label: 'Metrics', href: '/observability/metrics', icon: Activity, phase: 3 },
      { label: 'Log Forwarding', href: '/observability/log-forwarding', icon: Send, phase: 3 },
    ],
  },
  {
    label: 'Developer',
    items: [
      { label: 'API Keys', href: '/developer/api-keys', icon: KeyRound, phase: 3 },
      { label: 'Webhooks', href: '/developer/webhooks', icon: Webhook, phase: 3 },
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
