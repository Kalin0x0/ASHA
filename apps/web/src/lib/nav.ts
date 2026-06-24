import {
  Activity,
  AppWindow,
  BadgeCheck,
  BookOpen,
  Boxes,
  BrainCircuit,
  Bug,
  Cable,
  Cast,
  Cloud,
  Code2,
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
  LayoutGrid,
  Lock,
  type LucideIcon,
  MessageSquareWarning,
  MonitorPlay,
  Network,
  Palette,
  Rocket,
  Route,
  ScrollText,
  Send,
  Server,
  Settings2,
  Share2,
  ShieldCheck,
  ShieldHalf,
  SlidersHorizontal,
  TrendingUp,
  Users,
  UsersRound,
  Webhook,
} from 'lucide-react';

/**
 * Navigation is defined by stable translation keys, not display strings —
 * labels live in `messages/<locale>/shell.json` under `nav.groups.*` /
 * `nav.items.*` and are resolved at render time with `useTranslations`.
 */
export interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  key: string;
  /** Category-level glyph shown on the accordion header and the collapsed rail. */
  icon: LucideIcon;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: 'workstation',
    icon: AppWindow,
    items: [{ key: 'workstation', href: '/workstation', icon: AppWindow }],
  },
  {
    key: 'overview',
    icon: LayoutDashboard,
    items: [{ key: 'dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    key: 'workspaces',
    icon: LayoutGrid,
    items: [
      { key: 'catalog', href: '/workspaces', icon: AppWindow },
      { key: 'images', href: '/workspaces/images', icon: Container },
      { key: 'registry', href: '/registry', icon: Boxes },
    ],
  },
  {
    key: 'sessions',
    icon: MonitorPlay,
    items: [
      { key: 'liveSessions', href: '/sessions', icon: MonitorPlay },
      { key: 'history', href: '/sessions/history', icon: History },
      { key: 'recordings', href: '/sessions/recordings', icon: Film },
      { key: 'staging', href: '/sessions/staging', icon: Layers },
      { key: 'casting', href: '/sessions/casting', icon: Cast },
      { key: 'sharing', href: '/sessions/sharing', icon: Share2 },
    ],
  },
  {
    key: 'access',
    icon: Lock,
    items: [
      { key: 'users', href: '/users', icon: Users },
      { key: 'groups', href: '/groups', icon: UsersRound },
      { key: 'roles', href: '/roles', icon: ShieldCheck },
      { key: 'authentication', href: '/authentication', icon: KeyRound },
    ],
  },
  {
    key: 'infrastructure',
    icon: Server,
    items: [
      { key: 'zones', href: '/infrastructure/zones', icon: Globe },
      { key: 'agents', href: '/infrastructure/agents', icon: Server },
      { key: 'servers', href: '/infrastructure/servers', icon: HardDrive },
      { key: 'serverPools', href: '/infrastructure/server-pools', icon: Network },
      { key: 'autoscale', href: '/infrastructure/autoscale', icon: Gauge },
      { key: 'vmProviders', href: '/infrastructure/vm-providers', icon: Cloud },
      { key: 'dnsProviders', href: '/infrastructure/dns-providers', icon: Route },
    ],
  },
  {
    key: 'storage',
    icon: HardDrive,
    items: [
      { key: 'storageMappings', href: '/storage/mappings', icon: FolderTree },
      { key: 'persistentProfiles', href: '/storage/profiles', icon: FolderCog },
      { key: 'volumeMappings', href: '/storage/volumes', icon: Database },
      { key: 'fileMappings', href: '/storage/file-mappings', icon: FileCog },
    ],
  },
  {
    key: 'connectivity',
    icon: Cable,
    items: [
      { key: 'connectionProxies', href: '/connectivity/proxies', icon: Cable },
      { key: 'webFiltering', href: '/connectivity/web-filtering', icon: Filter },
      { key: 'browserIsolation', href: '/connectivity/browser-isolation', icon: ShieldHalf },
      { key: 'egress', href: '/connectivity/egress', icon: DoorOpen },
    ],
  },
  {
    key: 'settings',
    icon: SlidersHorizontal,
    items: [
      { key: 'general', href: '/settings/general', icon: Settings2 },
      { key: 'security', href: '/settings/security', icon: Fingerprint },
      { key: 'branding', href: '/settings/branding', icon: Palette },
      { key: 'banners', href: '/settings/banners', icon: Flag },
      { key: 'licensing', href: '/settings/licensing', icon: BadgeCheck },
      { key: 'database', href: '/settings/database', icon: DatabaseBackup },
      { key: 'configImportExport', href: '/settings/config', icon: FileJson },
    ],
  },
  {
    key: 'observability',
    icon: Activity,
    items: [
      { key: 'reporting', href: '/observability/reporting', icon: TrendingUp },
      { key: 'bugReports', href: '/observability/bug-reports', icon: Bug },
      { key: 'knowledgeBase', href: '/observability/knowledge-base', icon: BrainCircuit },
      { key: 'auditLog', href: '/observability/audit-log', icon: ScrollText },
      { key: 'metrics', href: '/observability/metrics', icon: Activity },
      { key: 'feedback', href: '/observability/feedback', icon: MessageSquareWarning },
      { key: 'logForwarding', href: '/observability/log-forwarding', icon: Send },
    ],
  },
  {
    key: 'developer',
    icon: Code2,
    items: [
      { key: 'updates', href: '/developer/updates', icon: Rocket },
      { key: 'apiKeys', href: '/developer/api-keys', icon: KeyRound },
      { key: 'webhooks', href: '/developer/webhooks', icon: Webhook },
      { key: 'apiDocs', href: '/developer/api-docs', icon: BookOpen },
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
