import {
  Activity,
  AppWindow,
  BadgeCheck,
  BookOpen,
  Boxes,
  BrainCircuit,
  Bug,
  Cable,
  CalendarClock,
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
  Timer,
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
  /**
   * Permission(s) that grant this item. Visible if the user is a system admin,
   * OR holds any of these permissions, OR perm is '*' (always). An item with no
   * perm is system-admin-only. Drives the "limited admin" (e.g. Operator) view.
   */
  perm?: string | string[];
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
    items: [{ key: 'workstation', href: '/workstation', icon: AppWindow, perm: '*' }],
  },
  {
    key: 'overview',
    icon: LayoutDashboard,
    items: [
      {
        key: 'dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        perm: ['SESSION_VIEW_ANY', 'REPORTING_VIEW', 'AGENT_VIEW'],
      },
    ],
  },
  {
    key: 'workspaces',
    icon: LayoutGrid,
    items: [
      { key: 'catalog', href: '/workspaces', icon: AppWindow, perm: 'WORKSPACE_VIEW' },
      { key: 'images', href: '/workspaces/images', icon: Container, perm: 'IMAGE_MANAGE' },
      { key: 'registry', href: '/registry', icon: Boxes, perm: 'REGISTRY_MANAGE' },
    ],
  },
  {
    key: 'sessions',
    icon: MonitorPlay,
    items: [
      { key: 'liveSessions', href: '/sessions', icon: MonitorPlay, perm: 'SESSION_VIEW_ANY' },
      { key: 'history', href: '/sessions/history', icon: History, perm: 'SESSION_VIEW_ANY' },
      { key: 'recordings', href: '/sessions/recordings', icon: Film, perm: 'RECORDING_VIEW' },
      { key: 'staging', href: '/sessions/staging', icon: Layers, perm: 'POOL_MANAGE' },
      { key: 'casting', href: '/sessions/casting', icon: Cast, perm: 'WORKSPACE_EDIT' },
      { key: 'sharing', href: '/sessions/sharing', icon: Share2, perm: 'SESSION_VIEW_ANY' },
    ],
  },
  {
    key: 'access',
    icon: Lock,
    items: [
      { key: 'users', href: '/users', icon: Users, perm: 'USER_VIEW' },
      { key: 'groups', href: '/groups', icon: UsersRound, perm: 'GROUP_MANAGE' },
      { key: 'roles', href: '/roles', icon: ShieldCheck, perm: 'ROLE_MANAGE' },
      { key: 'authentication', href: '/authentication', icon: KeyRound, perm: 'AUTH_MANAGE' },
    ],
  },
  {
    key: 'infrastructure',
    icon: Server,
    items: [
      { key: 'zones', href: '/infrastructure/zones', icon: Globe, perm: 'ZONE_MANAGE' },
      { key: 'agents', href: '/infrastructure/agents', icon: Server, perm: 'AGENT_VIEW' },
      { key: 'servers', href: '/infrastructure/servers', icon: HardDrive, perm: 'SERVER_MANAGE' },
      { key: 'serverPools', href: '/infrastructure/server-pools', icon: Network, perm: 'POOL_MANAGE' },
      { key: 'autoscale', href: '/infrastructure/autoscale', icon: Gauge, perm: 'AUTOSCALE_MANAGE' },
      { key: 'vmProviders', href: '/infrastructure/vm-providers', icon: Cloud, perm: 'PROVIDER_MANAGE' },
      { key: 'dnsProviders', href: '/infrastructure/dns-providers', icon: Route, perm: 'PROVIDER_MANAGE' },
    ],
  },
  {
    key: 'storage',
    icon: HardDrive,
    items: [
      { key: 'storageMappings', href: '/storage/mappings', icon: FolderTree, perm: 'STORAGE_MANAGE' },
      { key: 'persistentProfiles', href: '/storage/profiles', icon: FolderCog, perm: 'STORAGE_MANAGE' },
      { key: 'volumeMappings', href: '/storage/volumes', icon: Database, perm: 'STORAGE_MANAGE' },
      { key: 'fileMappings', href: '/storage/file-mappings', icon: FileCog, perm: 'STORAGE_MANAGE' },
    ],
  },
  {
    key: 'connectivity',
    icon: Cable,
    items: [
      { key: 'connectionProxies', href: '/connectivity/proxies', icon: Cable, perm: 'CONNECTIVITY_MANAGE' },
      { key: 'webFiltering', href: '/connectivity/web-filtering', icon: Filter, perm: 'CONNECTIVITY_MANAGE' },
      { key: 'browserIsolation', href: '/connectivity/browser-isolation', icon: ShieldHalf, perm: 'CONNECTIVITY_MANAGE' },
      { key: 'egress', href: '/connectivity/egress', icon: DoorOpen, perm: 'CONNECTIVITY_MANAGE' },
    ],
  },
  {
    key: 'settings',
    icon: SlidersHorizontal,
    items: [
      { key: 'general', href: '/settings/general', icon: Settings2, perm: 'SETTINGS_MANAGE' },
      { key: 'security', href: '/settings/security', icon: Fingerprint, perm: 'SETTINGS_MANAGE' },
      { key: 'branding', href: '/settings/branding', icon: Palette, perm: 'BRANDING_MANAGE' },
      { key: 'banners', href: '/settings/banners', icon: Flag, perm: 'SETTINGS_MANAGE' },
      { key: 'licensing', href: '/settings/licensing', icon: BadgeCheck, perm: 'LICENSE_MANAGE' },
      { key: 'tariffs', href: '/settings/tariffs', icon: Timer, perm: 'LICENSE_MANAGE' },
      { key: 'database', href: '/settings/database', icon: DatabaseBackup, perm: 'SETTINGS_MANAGE' },
      { key: 'configImportExport', href: '/settings/config', icon: FileJson, perm: 'SETTINGS_MANAGE' },
    ],
  },
  {
    key: 'observability',
    icon: Activity,
    items: [
      { key: 'reporting', href: '/observability/reporting', icon: TrendingUp, perm: 'REPORTING_VIEW' },
      { key: 'automation', href: '/observability/automation', icon: CalendarClock, perm: 'MAINTENANCE_MANAGE' },
      { key: 'bugReports', href: '/observability/bug-reports', icon: Bug, perm: 'BUG_VIEW' },
      { key: 'knowledgeBase', href: '/observability/knowledge-base', icon: BrainCircuit, perm: 'BUG_VIEW' },
      { key: 'auditLog', href: '/observability/audit-log', icon: ScrollText, perm: 'AUDIT_VIEW' },
      { key: 'metrics', href: '/observability/metrics', icon: Activity, perm: 'REPORTING_VIEW' },
      { key: 'feedback', href: '/observability/feedback', icon: MessageSquareWarning, perm: 'SETTINGS_MANAGE' },
      { key: 'logForwarding', href: '/observability/log-forwarding', icon: Send, perm: 'SETTINGS_MANAGE' },
    ],
  },
  {
    key: 'developer',
    icon: Code2,
    items: [
      { key: 'updates', href: '/developer/updates', icon: Rocket, perm: 'SETTINGS_MANAGE' },
      { key: 'apiKeys', href: '/developer/api-keys', icon: KeyRound, perm: 'APIKEY_MANAGE' },
      { key: 'webhooks', href: '/developer/webhooks', icon: Webhook, perm: 'WEBHOOK_MANAGE' },
      { key: 'apiDocs', href: '/developer/api-docs', icon: BookOpen, perm: 'APIKEY_MANAGE' },
    ],
  },
];

/**
 * The base end-user permissions (the default "User" role). A user whose
 * permissions are entirely within this set is a plain end-user and has no
 * business in the admin panel; anyone with a permission beyond it (e.g. an
 * Operator with SESSION_VIEW_ANY) is a "limited admin".
 */
const BASE_USER_PERMISSIONS = new Set<string>([
  'SESSION_VIEW',
  'SESSION_LAUNCH',
  'SESSION_TERMINATE_OWN',
  'SESSION_SHARE',
  'WORKSPACE_VIEW',
]);

/** Whether a user may enter the admin panel at all (system admin or any elevated perm). */
export function canAccessAdmin(perms: string[] | undefined, isSystemAdmin: boolean): boolean {
  if (isSystemAdmin) return true;
  return (perms ?? []).some((p) => !BASE_USER_PERMISSIONS.has(p));
}

/**
 * Whether a user may open a specific admin route. Resolves the route to its nav
 * item (longest-prefix, so detail routes inherit their section) and checks its
 * permission. Unknown routes are allowed (fail-open for edge pages; the API
 * still enforces per-endpoint permissions). Used to bounce a limited admin who
 * deep-links to a section that isn't in their nav.
 */
export function canAccessRoute(pathname: string, perms: string[] | undefined, isSystemAdmin: boolean): boolean {
  if (isSystemAdmin) return true;
  const match = findNavItem(pathname);
  if (!match) return true;
  const { perm } = match.item;
  if (!perm) return false; // untagged admin route → system-admin-only
  const need = Array.isArray(perm) ? perm : [perm];
  const set = new Set(perms ?? []);
  return need.some((p) => p === '*' || set.has(p));
}

/** Nav groups/items filtered to what this user may see (system admins see all). */
export function visibleNavGroups(perms: string[] | undefined, isSystemAdmin: boolean): NavGroup[] {
  const set = new Set(perms ?? []);
  const allow = (item: NavItem): boolean => {
    if (isSystemAdmin) return true;
    if (!item.perm) return false; // untagged → system-admin-only
    const need = Array.isArray(item.perm) ? item.perm : [item.perm];
    return need.some((p) => p === '*' || set.has(p));
  };
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter(allow) }))
    .filter((g) => g.items.length > 0);
}

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
