/**
 * The canonical permission catalog and role matrix. Imported by the API
 * (PermissionsGuard) and mirrored by the DB seed so the two never drift.
 */

export interface PermissionDef {
  key: string;
  category: string;
  description: string;
}

export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  { key: 'SESSION_VIEW', category: 'Sessions', description: 'View own sessions' },
  { key: 'SESSION_VIEW_ANY', category: 'Sessions', description: 'View all sessions' },
  { key: 'SESSION_LAUNCH', category: 'Sessions', description: 'Launch workspaces' },
  { key: 'SESSION_TERMINATE_OWN', category: 'Sessions', description: 'Terminate own sessions' },
  { key: 'SESSION_TERMINATE_ANY', category: 'Sessions', description: 'Terminate any session' },
  { key: 'SESSION_CONTROL_ANY', category: 'Sessions', description: 'Take control of any session' },
  { key: 'SESSION_SHARE', category: 'Sessions', description: 'Share sessions' },
  { key: 'RECORDING_VIEW', category: 'Sessions', description: 'View session recordings' },
  { key: 'WORKSPACE_VIEW', category: 'Workspaces', description: 'View workspaces' },
  { key: 'WORKSPACE_CREATE', category: 'Workspaces', description: 'Create workspaces' },
  { key: 'WORKSPACE_EDIT', category: 'Workspaces', description: 'Edit workspaces' },
  { key: 'WORKSPACE_DELETE', category: 'Workspaces', description: 'Delete workspaces' },
  { key: 'REGISTRY_MANAGE', category: 'Workspaces', description: 'Manage registries' },
  { key: 'IMAGE_MANAGE', category: 'Workspaces', description: 'Manage images' },
  { key: 'USER_VIEW', category: 'Access', description: 'View users' },
  { key: 'USER_CREATE', category: 'Access', description: 'Create users' },
  { key: 'USER_EDIT', category: 'Access', description: 'Edit users' },
  { key: 'USER_DELETE', category: 'Access', description: 'Delete users' },
  { key: 'GROUP_MANAGE', category: 'Access', description: 'Manage groups' },
  { key: 'ROLE_MANAGE', category: 'Access', description: 'Manage roles & permissions' },
  { key: 'AUTH_MANAGE', category: 'Access', description: 'Manage authentication providers' },
  { key: 'ZONE_MANAGE', category: 'Infrastructure', description: 'Manage deployment zones' },
  { key: 'AGENT_VIEW', category: 'Infrastructure', description: 'View agents' },
  { key: 'AGENT_MANAGE', category: 'Infrastructure', description: 'Manage agents' },
  { key: 'SERVER_MANAGE', category: 'Infrastructure', description: 'Manage servers' },
  { key: 'POOL_MANAGE', category: 'Infrastructure', description: 'Manage server pools' },
  { key: 'AUTOSCALE_MANAGE', category: 'Infrastructure', description: 'Manage autoscale configs' },
  { key: 'PROVIDER_MANAGE', category: 'Infrastructure', description: 'Manage VM/DNS providers' },
  { key: 'STORAGE_MANAGE', category: 'Storage', description: 'Manage storage & file mappings' },
  { key: 'CONNECTIVITY_MANAGE', category: 'Connectivity', description: 'Manage proxies/egress/filtering' },
  { key: 'SETTINGS_MANAGE', category: 'Settings', description: 'Manage global settings' },
  { key: 'BRANDING_MANAGE', category: 'Settings', description: 'Manage branding' },
  { key: 'LICENSE_MANAGE', category: 'Settings', description: 'Manage licensing' },
  { key: 'AUDIT_VIEW', category: 'Observability', description: 'View audit logs' },
  { key: 'REPORTING_VIEW', category: 'Observability', description: 'View reports & metrics' },
  { key: 'BUG_VIEW', category: 'Support', description: 'View bug reports & fix knowledge' },
  { key: 'BUG_MANAGE', category: 'Support', description: 'Triage, resolve & document bug reports' },
  { key: 'WEBHOOK_MANAGE', category: 'Developer', description: 'Manage webhooks' },
  { key: 'APIKEY_MANAGE', category: 'Developer', description: 'Manage API keys' },
] as const;

export const PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map((p) => p.key);

export const SUPER_ADMIN = '*';

export const SYSTEM_ROLE_MATRIX: Record<string, string[] | '*'> = {
  'Super Admin': SUPER_ADMIN,
  Administrator: PERMISSION_KEYS.filter((k) => k !== 'LICENSE_MANAGE'),
  Operator: [
    'SESSION_VIEW',
    'SESSION_VIEW_ANY',
    'SESSION_LAUNCH',
    'SESSION_TERMINATE_ANY',
    'SESSION_CONTROL_ANY',
    'RECORDING_VIEW',
    'WORKSPACE_VIEW',
    'AGENT_VIEW',
    'REPORTING_VIEW',
    'AUDIT_VIEW',
    'BUG_VIEW',
  ],
  User: ['SESSION_VIEW', 'SESSION_LAUNCH', 'SESSION_TERMINATE_OWN', 'SESSION_SHARE', 'WORKSPACE_VIEW'],
};

export function expandRole(role: string[] | '*'): string[] {
  return role === SUPER_ADMIN ? [...PERMISSION_KEYS] : role;
}

export type PermissionMode = 'any' | 'all';

export function hasPermission(
  granted: Iterable<string>,
  required: string | string[],
  mode: PermissionMode = 'all',
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  if (set.has(SUPER_ADMIN)) return true;
  const reqs = Array.isArray(required) ? required : [required];
  if (reqs.length === 0) return true;
  return mode === 'any' ? reqs.some((r) => set.has(r)) : reqs.every((r) => set.has(r));
}
