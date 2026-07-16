'use client';

import type {
  BugReportInput,
  BugReportRow,
  BugResolveInput,
  BugStats,
  BugStatus,
  BugFixRow,
  ClientErrorInput,
  MaintenanceCatalogEntry,
  MaintenanceRunRow,
  MaintenanceRunResult,
  MaintenanceTaskInput,
  MaintenanceTaskRow,
  SessionStatus,
} from '@/lib/types';
import type { AuthTokens, AuthUser } from './auth-store';
import { apiFetch } from './client';
import { API_BASE_URL } from './mode';

// ── API response shapes (as returned by the NestJS API) ──────────────────────

export interface ApiLoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface ApiSession {
  id: string;
  kasmId: string;
  /** Null while the session is an unclaimed pre-warmed (staged) pool session. */
  userId: string | null;
  workspaceId: string;
  /** Null once the session's zone has been deleted (history keeps the row). */
  zoneId: string | null;
  agentId: string | null;
  status: SessionStatus;
  connectionType: string;
  workspaceName: string | null;
  connectionUrl: string | null;
  resources: { cpuPct?: number; memMb?: number } | null;
  startedAt: string | null;
  createdAt: string;
}

export interface ApiImage {
  dockerImage: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH';
}

export type ApiWorkspaceType = 'CONTAINER' | 'SERVER' | 'REMOTE_APP' | 'VM' | 'LINK';

export interface ApiWorkspace {
  id: string;
  name: string;
  friendlyName: string;
  description: string | null;
  type: ApiWorkspaceType;
  imageId: string | null;
  serverId: string | null;
  zoneId: string | null;
  iconUrl: string | null;
  categories: string[];
  enabled: boolean;
  coresLimit: number | null;
  memLimitMb: number | null;
  gpuCount: number;
  image: ApiImage | null;
  server: { hostname: string; connectionType: string; zone?: { name: string } | null } | null;
  zone: { name: string } | null;
  // Access grants (empty on BOTH ⇒ visible to everyone).
  groups?: { id: string; name: string }[];
  assignedUsers?: { userId: string }[];
}

export interface ApiAgent {
  id: string;
  hostname: string;
  zoneId: string;
  status: 'ONLINE' | 'OFFLINE' | 'DRAINING' | 'UNHEALTHY';
  version: string | null;
  cpuCores: number;
  memTotalMb: number;
  memFreeMb: number;
  maxSessions: number;
  currentSessions: number;
  loadPercent: number;
  zone: { name: string } | null;
}

export interface ApiZone {
  id: string;
  name: string;
  region: string | null;
  isDefault: boolean;
  proxyBaseUrl: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'INVITED' | 'LOCKED';
  isSystemAdmin: boolean;
  lastLoginAt: string | null;
  /** License/access expiry (ISO). null = perpetual. */
  deactivatesAt: string | null;
  groups?: { group: { name: string } }[];
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function login(body: { email: string; password: string; totp?: string }) {
  return apiFetch<ApiLoginResponse>('/auth/login', { method: 'POST', body, auth: false });
}

export function getMe() {
  return apiFetch<AuthUser>('/auth/me');
}

/** Whether the public 10-minute demo button is enabled for this deployment. */
export function getDemoConfig() {
  return apiFetch<{ enabled: boolean }>('/auth/demo', { auth: false });
}

export interface ApiDemoResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  tokenType: string;
  demoExpiresAt: string;
  user: AuthUser;
}
/** Start a one-shot 10-minute demo session (deduped per e-mail + device server-side). */
export function loginAsDemo(body: { email: string; fingerprint: string }) {
  return apiFetch<ApiDemoResponse>('/auth/demo', { method: 'POST', body, auth: false });
}

// ── Self-service account / profile ───────────────────────────────────────────
export interface ApiAccount {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'INVITED' | 'LOCKED' | 'DEMO';
  isSystemAdmin: boolean;
  locale: string;
  lastLoginAt: string | null;
  createdAt: string;
  isLocalAccount: boolean;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  groups: string[];
}
export interface UpdateAccountInput {
  displayName?: string | null;
  locale?: string;
  avatarUrl?: string | null;
  email?: string;
}
export const getAccount = () => apiFetch<ApiAccount>('/account');
export const updateAccount = (body: UpdateAccountInput) => apiFetch<ApiAccount>('/account', { method: 'PATCH', body });
export const changePassword = (body: { currentPassword?: string; newPassword: string }) =>
  apiFetch<{ ok: true }>('/account/password', { method: 'POST', body });

// 2FA / TOTP self-service (backend already implements these).
export interface TotpEnrollResponse {
  methodId: string;
  otpUri: string;
  qrDataUrl: string;
}
export const enrollTotp = () => apiFetch<TotpEnrollResponse>('/auth/2fa/totp/enroll', { method: 'POST' });
export const confirmTotp = (body: { methodId: string; code: string }) =>
  apiFetch<{ ok: true }>('/auth/2fa/totp/confirm', { method: 'POST', body });
export const disableTotp = () => apiFetch<{ ok: true }>('/auth/2fa/totp', { method: 'DELETE' });

export function logout(refreshToken: string | null) {
  return apiFetch<{ ok: true }>('/auth/logout', {
    method: 'POST',
    body: { refreshToken: refreshToken ?? undefined },
  });
}

// ── Resources ─────────────────────────────────────────────────────────────────

export const getSessions = () => apiFetch<ApiSession[]>('/sessions');
// The signed-in user's OWN sessions (server-scoped) — the isolated portal list.
export const getMySessions = () => apiFetch<ApiSession[]>('/sessions/mine');
export const getSession = (id: string) => apiFetch<ApiSession>(`/sessions/${id}`);
export const createSession = (workspaceId: string) =>
  apiFetch<ApiSession>('/sessions', { method: 'POST', body: { workspaceId } });
export const terminateSession = (id: string) =>
  apiFetch<{ ok: true }>(`/sessions/${id}`, { method: 'DELETE' });

// ── Session control: pause / resume / resize (multi-monitor) ───────────────────
export const pauseSession = (id: string) =>
  apiFetch<{ ok: true }>(`/sessions/${id}/pause`, { method: 'POST' });
export const resumeSession = (id: string) =>
  apiFetch<{ ok: true }>(`/sessions/${id}/resume`, { method: 'POST' });
export const resizeSession = (id: string, width: number, height: number) =>
  apiFetch<{ ok: true }>(`/sessions/${id}/resize`, { method: 'POST', body: { width, height } });
/** Refresh the session's lastKeepaliveAt so the idle reaper doesn't terminate an
 *  actively-used desktop. Called periodically by the viewers while connected. */
export const sessionKeepalive = (id: string) =>
  apiFetch<{ ok: true }>(`/sessions/${id}/keepalive`, { method: 'POST' });

export interface ApiSessionConnection {
  connectionUrl: string | null;
  status: SessionStatus;
  dlp?: {
    clipboardUp?: boolean;
    clipboardDown?: boolean;
    uploads?: boolean;
    downloads?: boolean;
    printing?: boolean;
    audioIn?: boolean;
    audioOut?: boolean;
    pwa?: boolean;
  };
}
export const getSessionConnection = (id: string) =>
  apiFetch<ApiSessionConnection>(`/sessions/${id}/connection`);

// ── Image registries & marketplace ────────────────────────────────────────────
export interface ApiRegistry {
  id: string;
  name: string;
  url: string;
  type: 'FIRST_PARTY' | 'THIRD_PARTY';
  enabled: boolean;
  lastSyncedAt: string | null;
  _count?: { entries: number };
}
export interface ApiMarketplaceEntry {
  id: string;
  name: string;
  friendlyName: string;
  description: string | null;
  dockerImage: string;
  iconUrl: string | null;
  categories: string[];
  installed: boolean;
  /** Estimated image size in MB (shown in the catalog, when known). */
  sizeMb?: number;
  registry?: { name: string; type: string };
}
export const getRegistries = () => apiFetch<ApiRegistry[]>('/registries');
export const createRegistry = (body: { name: string; url: string; type?: string }) =>
  apiFetch<ApiRegistry>('/registries', { method: 'POST', body });
export const syncRegistry = (id: string) =>
  apiFetch<{ ok: true; upserted: number }>(`/registries/${id}/sync`, { method: 'POST' });
export const deleteRegistry = (id: string) =>
  apiFetch<{ ok: true }>(`/registries/${id}`, { method: 'DELETE' });
export const getMarketplace = (q?: string) =>
  apiFetch<ApiMarketplaceEntry[]>(`/marketplace${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const installMarketplaceEntry = (entryId: string, createWorkspace: boolean) =>
  apiFetch<{ ok: true; imageId: string; workspaceId?: string }>(
    `/marketplace/${entryId}/install`,
    { method: 'POST', body: { createWorkspace } },
  );
/** Reinstall the image installed from a registry entry (refresh metadata + re-pull). */
export const reinstallMarketplaceEntry = (entryId: string) =>
  apiFetch<{ ok: true; imageId: string; dockerImage: string }>(`/marketplace/${entryId}/reinstall`, {
    method: 'POST',
  });
/** Uninstall the image installed from a registry entry, reclaiming host disk. */
export const uninstallMarketplaceEntry = (entryId: string) =>
  apiFetch<{ ok: true; hostImageRemoved: boolean; sharedWithOtherImages: boolean }>(
    `/marketplace/${entryId}/uninstall`,
    { method: 'POST' },
  );

// ── Licensing ──────────────────────────────────────────────────────────────────
export interface ApiLicenseUsage {
  type: 'CONCURRENT' | 'NAMED_USER' | null;
  seats: number | null;
  concurrentSessions: number | null;
  usedConcurrent: number;
  usedSeats: number;
  licensed: boolean;
}
export const getLicense = () => apiFetch<unknown>('/license');
export const getLicenseUsage = () => apiFetch<ApiLicenseUsage>('/license/usage');
export const upsertLicense = (body: {
  type: 'CONCURRENT' | 'NAMED_USER';
  seats: number;
  concurrentSessions: number;
}) => apiFetch<unknown>('/license', { method: 'PUT', body });

// ── Images (installed) — management + resources ──────────────────────────────
export interface ApiImageWorkspace {
  id: string;
  friendlyName: string;
  coresLimit: number | null;
  memLimitMb: number | null;
  gpuCount: number;
}
export interface ApiImageRow {
  id: string;
  name: string;
  friendlyName: string;
  dockerImage: string;
  protocol: string;
  architecture: string;
  digest: string | null;
  pullPolicy: 'ALWAYS' | 'IF_NOT_PRESENT' | 'NEVER';
  available: boolean;
  createdAt: string;
  workspaces: ApiImageWorkspace[];
}
export const getImages = () => apiFetch<ApiImageRow[]>('/images');
/** Remove (uninstall) an image. `hostImageRemoved` reports whether host disk was reclaimed. */
export const deleteImageEntry = (id: string) =>
  apiFetch<{ ok: true; hostImageRemoved: boolean; sharedWithOtherImages: boolean }>(`/images/${id}`, {
    method: 'DELETE',
  });
/** Reinstall an image: refresh its registry metadata + re-pull it onto the agents. */
export const reinstallImageEntry = (id: string) =>
  apiFetch<{ ok: true; imageId: string; dockerImage: string }>(`/images/${id}/reinstall`, { method: 'POST' });
export const setImagePullPolicy = (id: string, pullPolicy: ApiImageRow['pullPolicy']) =>
  apiFetch<ApiImageRow>(`/images/${id}/pull-policy`, { method: 'PATCH', body: { pullPolicy } });

export const getWorkspaces = () => apiFetch<ApiWorkspace[]>('/workspaces');
export const getLaunchableWorkspaces = () => apiFetch<ApiWorkspace[]>('/workspaces/launchable');

export interface CreateWorkspaceBody {
  name: string;
  friendlyName: string;
  description?: string;
  iconUrl?: string;
  type?: ApiWorkspaceType;
  categories?: string[];
  coresLimit?: number;
  memLimitMb?: number;
  gpuCount?: number;
  /** When set (and no imageId), the API creates + links a backing image. */
  dockerImage?: string;
  /** Server-backed placement (SERVER/VM/REMOTE_APP). */
  serverId?: string;
  /** Preferred deployment zone. */
  zoneId?: string;
  enabled?: boolean;
}
export const createWorkspace = (body: CreateWorkspaceBody) =>
  apiFetch<ApiWorkspace>('/workspaces', { method: 'POST', body });
export type UpdateWorkspaceBody = Partial<
  Pick<
    CreateWorkspaceBody,
    'friendlyName' | 'description' | 'iconUrl' | 'type' | 'serverId' | 'zoneId' | 'coresLimit' | 'memLimitMb' | 'gpuCount'
  > & {
    categories: string[];
    enabled: boolean;
  }
>;
export const updateWorkspace = (id: string, body: UpdateWorkspaceBody) =>
  apiFetch<ApiWorkspace>(`/workspaces/${id}`, { method: 'PATCH', body });
export const deleteWorkspace = (id: string) =>
  apiFetch<{ ok: true }>(`/workspaces/${id}`, { method: 'DELETE' });
/** Replace a workspace's access grants (users + groups). Empty arrays ⇒ everyone. */
export const setWorkspaceAssignments = (id: string, body: { userIds: string[]; groupIds: string[] }) =>
  apiFetch<ApiWorkspace>(`/workspaces/${id}/assignments`, { method: 'PATCH', body });
export const getAgents = () => apiFetch<ApiAgent[]>('/agents');
export const getZones = () => apiFetch<ApiZone[]>('/zones');
export const getUsers = () => apiFetch<ApiUser[]>('/users');

export interface CreateUserBody {
  email: string;
  username?: string;
  displayName?: string;
  password?: string;
  isSystemAdmin?: boolean;
  locale?: string;
  /** License/access expiry (ISO). null/omitted = perpetual. */
  deactivatesAt?: string | null;
}
export const createUser = (body: CreateUserBody) =>
  apiFetch<ApiUser>('/users', { method: 'POST', body });
export const updateUser = (
  id: string,
  body: Partial<{
    username: string;
    displayName: string | null;
    locale: string;
    isSystemAdmin: boolean;
    status: ApiUser['status'];
    password: string;
    /** Set/extend (renew) or clear (null → perpetual) the license expiry. */
    deactivatesAt: string | null;
  }>,
) => apiFetch<ApiUser>(`/users/${id}`, { method: 'PATCH', body });
export const deleteUser = (id: string) =>
  apiFetch<{ ok: true }>(`/users/${id}`, { method: 'DELETE' });

export interface ApiGroup {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  isDefault: boolean;
  _count?: { members: number };
}
export const getGroups = () => apiFetch<ApiGroup[]>('/groups');

// ── Storage ────────────────────────────────────────────────────────────────

export interface ApiVolumeMapping {
  id: string;
  name: string;
  hostPath: string;
  destPath: string;
  readOnly: boolean;
}
export interface ApiFileMapping {
  id: string;
  name: string;
  target: 'CONTAINER' | 'WINDOWS';
  sourcePath: string;
  destPath: string;
  owner: string | null;
  group: string | null;
  mode: string | null;
  isHomeProfile: boolean;
  scope: 'USER' | 'GROUP' | 'WORKSPACE';
}
export interface ApiPersistentProfile {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  volumeName: string;
  backend: 'DOCKER_VOLUME' | 'S3';
  sizeLimitMb: number | null;
  lastUsedAt: string | null;
}

export const getVolumeMappings = () => apiFetch<ApiVolumeMapping[]>('/storage/volumes');
export const createVolumeMapping = (body: {
  name: string;
  hostPath: string;
  destPath: string;
  readOnly?: boolean;
  raw?: Record<string, unknown>;
}) => apiFetch<ApiVolumeMapping>('/storage/volumes', { method: 'POST', body });
export const deleteVolumeMapping = (id: string) =>
  apiFetch<{ ok: true }>(`/storage/volumes/${id}`, { method: 'DELETE' });

export const getFileMappings = () => apiFetch<ApiFileMapping[]>('/storage/files');
export const createFileMapping = (body: {
  name: string;
  target?: 'CONTAINER' | 'WINDOWS';
  sourcePath: string;
  destPath: string;
  owner?: string;
  group?: string;
  mode?: string;
  isHomeProfile?: boolean;
  scope?: 'USER' | 'GROUP' | 'WORKSPACE';
  userId?: string;
}) => apiFetch<ApiFileMapping>('/storage/files', { method: 'POST', body });
export const deleteFileMapping = (id: string) =>
  apiFetch<{ ok: true }>(`/storage/files/${id}`, { method: 'DELETE' });

export const getPersistentProfiles = () => apiFetch<ApiPersistentProfile[]>('/storage/profiles');
export const createPersistentProfile = (body: {
  userId?: string;
  workspaceId?: string;
  volumeName: string;
  backend?: 'DOCKER_VOLUME' | 'S3';
  sizeLimitMb?: number;
}) => apiFetch<ApiPersistentProfile>('/storage/profiles', { method: 'POST', body });
export const deletePersistentProfile = (id: string) =>
  apiFetch<{ ok: true }>(`/storage/profiles/${id}`, { method: 'DELETE' });

// ── Recordings ───────────────────────────────────────────────────────────────

export interface ApiRecording {
  id: string;
  sessionId: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH';
  status: 'RECORDING' | 'FINALIZING' | 'AVAILABLE' | 'FAILED';
  bytes: number | string;
  durationSec: number;
  startedAt: string;
  finalizedAt: string | null;
  _count?: { artifacts: number };
}

export const getRecordings = () => apiFetch<ApiRecording[]>('/recordings');

// ── Session sharing ──────────────────────────────────────────────────────────

export interface ApiSessionShare {
  id: string;
  sessionId: string;
  shareKey: string;
  allowControl: boolean;
  requireAuth: boolean;
  enableChat: boolean;
  enableAv: boolean;
  expiresAt: string | null;
  /** Optional joins surfaced by the admin listing (display-only). */
  createdAt?: string;
  ownerName?: string | null;
  workspaceName?: string | null;
  participantCount?: number;
}

export const createShare = (
  sessionId: string,
  body: { allowControl?: boolean; requireAuth?: boolean; enableChat?: boolean; enableAv?: boolean; expiresInMinutes?: number },
) => apiFetch<ApiSessionShare>(`/sessions/${sessionId}/share`, { method: 'POST', body });

export const revokeShare = (sessionId: string) =>
  apiFetch<{ ok: true }>(`/sessions/${sessionId}/share`, { method: 'DELETE' });

// ── Identity: auth providers (OIDC / SAML / LDAP) ────────────────────────────

export type AuthProviderType = 'LOCAL' | 'LDAP' | 'SAML' | 'OIDC';

export interface ApiAuthProvider {
  id: string;
  orgId: string;
  type: AuthProviderType;
  name: string;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface ApiPublicAuthProvider {
  id: string;
  orgId: string;
  type: 'OIDC' | 'SAML' | 'LDAP';
  name: string;
}

export const getAuthProviders = () => apiFetch<ApiAuthProvider[]>('/auth/providers');
export const getPublicAuthProviders = () =>
  apiFetch<ApiPublicAuthProvider[]>('/auth/providers/public', { auth: false });
export const createAuthProvider = (body: {
  type: AuthProviderType;
  name: string;
  enabled?: boolean;
  priority?: number;
  config?: Record<string, unknown>;
}) => apiFetch<ApiAuthProvider>('/auth/providers', { method: 'POST', body });
export const updateAuthProvider = (id: string, body: Partial<{ name: string; enabled: boolean; priority: number; config: Record<string, unknown> }>) =>
  apiFetch<ApiAuthProvider>(`/auth/providers/${id}`, { method: 'PATCH', body });
export const deleteAuthProvider = (id: string) =>
  apiFetch<{ ok: true }>(`/auth/providers/${id}`, { method: 'DELETE' });
export const testLdapProvider = (id: string, sampleUsername?: string) =>
  apiFetch<{ ok: boolean; message?: string; entries?: number }>(`/auth/providers/${id}/ldap-test`, {
    method: 'POST',
    body: { sampleUsername },
  });

// SSO group mappings — map an IdP attribute/value onto a Asha group.
export interface ApiSsoMapping {
  id: string;
  authConfigId: string;
  groupId: string;
  attribute: string;
  value: string;
  createdAt: string;
}

export const getSsoMappings = (providerId: string) =>
  apiFetch<ApiSsoMapping[]>(`/auth/providers/${providerId}/mappings`);
export const createSsoMapping = (body: {
  authConfigId: string;
  groupId: string;
  attribute: string;
  value: string;
}) => apiFetch<ApiSsoMapping>('/auth/providers/mappings', { method: 'POST', body });
export const deleteSsoMapping = (mappingId: string) =>
  apiFetch<{ ok: true }>(`/auth/providers/mappings/${mappingId}`, { method: 'DELETE' });

/** Build the SP-initiated login redirect URL for an SSO provider. */
export function ssoLoginUrl(provider: ApiPublicAuthProvider, returnTo = '/dashboard'): string {
  const base = API_BASE_URL;
  const rt = encodeURIComponent(returnTo);
  if (provider.type === 'OIDC') return `${base}/auth/oidc/${provider.id}/login?returnTo=${rt}`;
  if (provider.type === 'SAML') return `${base}/auth/saml/${provider.id}/login?returnTo=${rt}`;
  // LDAP has no redirect — handled by a username/password form.
  return '';
}

// ── SCIM 2.0 provisioning tokens ─────────────────────────────────────────────

export const issueScimToken = () =>
  apiFetch<{ token: string; id: string }>('/scim/v2/tokens', { method: 'POST' });
export const revokeScimToken = (id: string) =>
  apiFetch<void>(`/scim/v2/tokens/${id}`, { method: 'DELETE' });

// ── VM providers ─────────────────────────────────────────────────────────────

export type VMProviderKind =
  | 'AWS' | 'AZURE' | 'DIGITALOCEAN' | 'GCP' | 'HARVESTER' | 'ORACLE'
  | 'NUTANIX' | 'PROXMOX' | 'VSPHERE' | 'OPENSTACK' | 'KUBEVIRT';

export interface ApiVMProvider {
  id: string;
  name: string;
  provider: VMProviderKind;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

export const getVMProviders = () => apiFetch<ApiVMProvider[]>('/providers/vm');
export const createVMProvider = (body: {
  name: string;
  provider: VMProviderKind;
  config: Record<string, unknown>;
  enabled?: boolean;
}) => apiFetch<ApiVMProvider>('/providers/vm', { method: 'POST', body });
export const updateVMProvider = (id: string, body: Partial<{ name: string; enabled: boolean; config: Record<string, unknown> }>) =>
  apiFetch<ApiVMProvider>(`/providers/vm/${id}`, { method: 'PATCH', body });
export const deleteVMProvider = (id: string) =>
  apiFetch<{ ok: true }>(`/providers/vm/${id}`, { method: 'DELETE' });

// ── DNS providers ─────────────────────────────────────────────────────────────

export type DNSProviderKind = 'AWS' | 'AZURE' | 'DIGITALOCEAN' | 'GCP' | 'ORACLE';

export interface ApiDNSProvider {
  id: string;
  name: string;
  provider: DNSProviderKind;
  zoneName: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

export const getDNSProviders = () => apiFetch<ApiDNSProvider[]>('/providers/dns');
export const createDNSProvider = (body: {
  name: string;
  provider: DNSProviderKind;
  zoneName?: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}) => apiFetch<ApiDNSProvider>('/providers/dns', { method: 'POST', body });
export const updateDNSProvider = (id: string, body: Partial<{ name: string; zoneName: string; enabled: boolean; config: Record<string, unknown> }>) =>
  apiFetch<ApiDNSProvider>(`/providers/dns/${id}`, { method: 'PATCH', body });
export const deleteDNSProvider = (id: string) =>
  apiFetch<{ ok: true }>(`/providers/dns/${id}`, { method: 'DELETE' });

// ── Zones (CRUD) ──────────────────────────────────────────────────────────────

export const createZone = (body: {
  name: string;
  region?: string;
  isDefault?: boolean;
  proxyBaseUrl?: string;
}) => apiFetch<ApiZone>('/zones', { method: 'POST', body });
export const updateZone = (id: string, body: Partial<{ name: string; region: string; isDefault: boolean; proxyBaseUrl: string }>) =>
  apiFetch<ApiZone>(`/zones/${id}`, { method: 'PATCH', body });
export const deleteZone = (id: string) =>
  apiFetch<{ ok: true }>(`/zones/${id}`, { method: 'DELETE' });

// ── Servers ─────────────────────────────────────────────────────────────────

export interface ApiServer {
  id: string;
  zoneId: string;
  hostname: string;
  address: string;
  connectionType: 'SSH' | 'RDP' | 'VNC';
  authMode: 'PASSWORD' | 'KEY' | 'VMWARE_TEMPLATE';
  continuity: 'NONE' | 'TMUX' | 'SCREEN';
  maxSessions: number;
  currentSessions?: number;
  status?: string;
  /** Set by the installed host agent (availability tracking). */
  lastSeenAt?: string | null;
  agentVersion?: string | null;
  zone?: { name: string } | null;
}

/** A freshly minted registration token (the plaintext is returned once). */
export interface ApiRegistrationToken {
  id: string;
  name: string;
  token: string;
  zoneId: string | null;
  expiresAt: string | null;
  createdAt: string;
}
export const mintRegistrationToken = (body: { name: string; zoneId?: string; expiresInDays?: number }) =>
  apiFetch<ApiRegistrationToken>('/registration-tokens', { method: 'POST', body });

export const getServers = () => apiFetch<ApiServer[]>('/servers');
export const createServer = (body: {
  zoneId: string;
  hostname: string;
  address: string;
  connectionType?: 'SSH' | 'RDP' | 'VNC';
  authMode?: 'PASSWORD' | 'KEY' | 'VMWARE_TEMPLATE';
  continuity?: 'NONE' | 'TMUX' | 'SCREEN';
  maxSessions?: number;
  username?: string;
  password?: string;
  security?: 'any' | 'nla' | 'nla-ext' | 'tls' | 'rdp' | 'vmconnect';
}) => apiFetch<ApiServer>('/servers', { method: 'POST', body });
export const updateServer = (
  id: string,
  body: Partial<{
    address: string;
    maxSessions: number;
    connectionType: 'SSH' | 'RDP' | 'VNC';
    username: string;
    password: string;
    security: 'any' | 'nla' | 'nla-ext' | 'tls' | 'rdp' | 'vmconnect';
  }>,
) => apiFetch<ApiServer>(`/servers/${id}`, { method: 'PATCH', body });
export const deleteServer = (id: string) =>
  apiFetch<{ ok: true }>(`/servers/${id}`, { method: 'DELETE' });

/** A generated `.rdp` connection file for the native Remote Desktop client. */
export interface ApiRdpFile {
  filename: string;
  content: string;
}
export interface RdpFileOptions {
  multimon?: boolean;
  clipboard?: boolean;
  drives?: boolean;
  printers?: boolean;
}
export const getServerRdpFile = (id: string, o: RdpFileOptions = {}) => {
  const q = new URLSearchParams();
  const set = (k: string, v: boolean | undefined) => {
    if (v !== undefined) q.set(k, v ? '1' : '0');
  };
  set('multimon', o.multimon);
  set('clipboard', o.clipboard);
  set('drives', o.drives);
  set('printers', o.printers);
  const qs = q.toString();
  return apiFetch<ApiRdpFile>(`/servers/${id}/rdp-file${qs ? `?${qs}` : ''}`);
};

/** Open a browser session against a fixed server (RDP/VNC/SSH via the proxy). */
export interface ApiServerConnect {
  sessionId: string;
  kasmId: string;
  connectionUrl: string;
  connectionType: 'GUAC_RDP' | 'GUAC_VNC' | 'GUAC_SSH';
}
export const connectServer = (id: string) =>
  apiFetch<ApiServerConnect>(`/servers/${id}/connect`, { method: 'POST' });

// ── Server pools + autoscale ──────────────────────────────────────────────────

export interface ApiAutoscaleConfig {
  mode: 'SCHEDULE' | 'LOAD' | 'ACTIVE_DIRECTORY';
  minStandby: number;
  maxInstances: number;
  perServerSessionLimit: number;
  checkinIntervalSec: number;
  downscaleBackoffSec: number;
  vmProviderId: string | null;
  dnsProviderId: string | null;
}

export interface ApiServerPool {
  id: string;
  name: string;
  kind: 'SERVER' | 'AGENT';
  startupScript: string | null;
  enabled: boolean;
  autoscaleConfig: ApiAutoscaleConfig | null;
  _count?: { members: number };
}

export const getPools = () => apiFetch<ApiServerPool[]>('/pools');
export const createPool = (body: {
  name: string;
  kind?: 'SERVER' | 'AGENT';
  startupScript?: string;
  enabled?: boolean;
}) => apiFetch<ApiServerPool>('/pools', { method: 'POST', body });
export const updatePool = (id: string, body: Partial<{ name: string; startupScript: string; enabled: boolean }>) =>
  apiFetch<ApiServerPool>(`/pools/${id}`, { method: 'PATCH', body });
export const deletePool = (id: string) =>
  apiFetch<{ ok: true }>(`/pools/${id}`, { method: 'DELETE' });
export const upsertAutoscale = (poolId: string, body: Partial<ApiAutoscaleConfig>) =>
  apiFetch<ApiAutoscaleConfig>(`/pools/${poolId}/autoscale`, { method: 'PUT', body });
export const disableAutoscale = (poolId: string) =>
  apiFetch<{ ok: true }>(`/pools/${poolId}/autoscale`, { method: 'DELETE' });

// ── Reporting + metrics + audit ───────────────────────────────────────────────

export interface ApiReportSummary {
  totalSessions: number;
  activeSessions: number;
  totalWorkspaces: number;
  agents: { online: number; total: number };
  recordings: number;
}
export interface ApiSessionsOverTime {
  since: string;
  series: Array<{ date: string; count: number }>;
}
export interface ApiTopWorkspace {
  workspaceId: string;
  name: string;
  sessions: number;
}
export interface ApiMetricSeries {
  metric: string;
  since: string;
  series: Array<{ hour: string; avg: number }>;
}
export interface ApiAuditEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const getReportSummary = () => apiFetch<ApiReportSummary>('/reporting/summary');
export const getSessionsOverTime = (days = 30) =>
  apiFetch<ApiSessionsOverTime>(`/reporting/sessions-over-time?days=${days}`);
export const getTopWorkspaces = (days = 30, limit = 10) =>
  apiFetch<ApiTopWorkspace[]>(`/reporting/top-workspaces?days=${days}&limit=${limit}`);
export const getMetricSeries = (metric: string, hours = 24) =>
  apiFetch<ApiMetricSeries>(`/reporting/metrics?metric=${encodeURIComponent(metric)}&hours=${hours}`);
export const getAuditLog = (limit = 100, action?: string) =>
  apiFetch<ApiAuditEntry[]>(`/reporting/audit-log?limit=${limit}${action ? `&action=${encodeURIComponent(action)}` : ''}`);

// ── Log forwarders ────────────────────────────────────────────────────────────

export type LogForwarderType = 'syslog' | 'splunk_hec' | 'elasticsearch' | 'loki' | 'http';
export interface ApiLogForwarder {
  id: string;
  name: string;
  type: LogForwarderType;
  endpoint: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}
export const getLogForwarders = () => apiFetch<ApiLogForwarder[]>('/log-forwarders');
export const createLogForwarder = (body: {
  name: string;
  type: LogForwarderType;
  endpoint?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}) => apiFetch<ApiLogForwarder>('/log-forwarders', { method: 'POST', body });
export const updateLogForwarder = (id: string, body: Partial<{ name: string; endpoint: string; enabled: boolean; config: Record<string, unknown> }>) =>
  apiFetch<ApiLogForwarder>(`/log-forwarders/${id}`, { method: 'PATCH', body });
export const deleteLogForwarder = (id: string) =>
  apiFetch<{ ok: true }>(`/log-forwarders/${id}`, { method: 'DELETE' });
export const getFluentBitConfig = (id: string) =>
  apiFetch<{ filename: string; content: string }>(`/log-forwarders/${id}/fluent-bit-config`);

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface ApiWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}
export interface ApiWebhookDelivery {
  id: string;
  event: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  responseCode: number | null;
  attempts: number;
  createdAt: string;
}
export const getWebhooks = () => apiFetch<ApiWebhook[]>('/webhooks');
export const createWebhook = (body: {
  name: string;
  url: string;
  events: string[];
  secret?: string;
  enabled?: boolean;
}) => apiFetch<ApiWebhook>('/webhooks', { method: 'POST', body });
export const updateWebhook = (id: string, body: Partial<{ name: string; url: string; events: string[]; enabled: boolean }>) =>
  apiFetch<ApiWebhook>(`/webhooks/${id}`, { method: 'PATCH', body });
export const deleteWebhook = (id: string) =>
  apiFetch<{ ok: true }>(`/webhooks/${id}`, { method: 'DELETE' });
export const getWebhookDeliveries = (id: string) =>
  apiFetch<ApiWebhookDelivery[]>(`/webhooks/${id}/deliveries`);
export const testWebhook = (id: string) =>
  apiFetch<{ status: 'SUCCESS' | 'FAILED'; responseCode: number | null }>(`/webhooks/${id}/test`, { method: 'POST' });

// ── API keys ──────────────────────────────────────────────────────────────────

export interface ApiApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export const getApiKeys = () => apiFetch<ApiApiKey[]>('/api-keys');
export const createApiKey = (body: { name: string; scopes?: string[]; expiresInDays?: number }) =>
  apiFetch<{ id: string; name: string; prefix: string; token: string; scopes: string[]; expiresAt: string | null }>(
    '/api-keys',
    { method: 'POST', body },
  );
export const revokeApiKey = (id: string) =>
  apiFetch<{ ok: true }>(`/api-keys/${id}`, { method: 'DELETE' });

// ── Session staging ───────────────────────────────────────────────────────────

export interface ApiStaging {
  id: string;
  workspaceId: string;
  zoneId: string;
  desiredSessions: number;
  enabled: boolean;
  /** Unclaimed RUNNING pool sessions — instantly claimable by a launch. */
  readyCount: number;
  /** Unclaimed pool sessions still provisioning. */
  warmingCount: number;
  /** Why the pool isn't filling (reconciler-written), null when healthy. */
  lastError: string | null;
  lastReconciledAt: string | null;
  workspace?: { id: string; name: string; friendlyName: string | null } | null;
}
export const getStaging = () => apiFetch<ApiStaging[]>('/staging');
export const createStaging = (body: { workspaceId: string; zoneId: string; desiredSessions?: number; enabled?: boolean }) =>
  apiFetch<ApiStaging>('/staging', { method: 'POST', body });
export const updateStaging = (id: string, body: Partial<{ desiredSessions: number; enabled: boolean }>) =>
  apiFetch<ApiStaging>(`/staging/${id}`, { method: 'PATCH', body });
export const deleteStaging = (id: string) =>
  apiFetch<{ ok: true }>(`/staging/${id}`, { method: 'DELETE' });

// ── Casting ───────────────────────────────────────────────────────────────────

export interface ApiCasting {
  id: string;
  workspaceId: string;
  allowAnonymous: boolean;
  requireAuth: boolean;
  maxConcurrent: number | null;
  enabled: boolean;
  workspace?: { id: string; name: string; friendlyName: string | null } | null;
}
export const getCasting = () => apiFetch<ApiCasting[]>('/casting');
export const createCasting = (body: {
  workspaceId: string;
  allowAnonymous?: boolean;
  requireAuth?: boolean;
  maxConcurrent?: number;
  enabled?: boolean;
}) => apiFetch<ApiCasting>('/casting', { method: 'POST', body });
export const updateCasting = (id: string, body: Partial<{ allowAnonymous: boolean; requireAuth: boolean; maxConcurrent: number; enabled: boolean }>) =>
  apiFetch<ApiCasting>(`/casting/${id}`, { method: 'PATCH', body });
export const deleteCasting = (id: string) =>
  apiFetch<{ ok: true }>(`/casting/${id}`, { method: 'DELETE' });

// ── Storage mappings (network/object storage mounts) ──────────────────────────

export type StorageKind = 'DROPBOX' | 'GDRIVE' | 'NEXTCLOUD' | 'ONEDRIVE' | 'S3' | 'CUSTOM';
export interface ApiStorageMapping {
  id: string;
  name: string;
  kind: StorageKind;
  mountPath: string;
  readOnly: boolean;
  scope: 'USER' | 'GROUP' | 'WORKSPACE';
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}
export const getStorageMappings = () => apiFetch<ApiStorageMapping[]>('/storage/mappings');
export const createStorageMapping = (body: {
  name: string;
  kind: StorageKind;
  mountPath: string;
  readOnly?: boolean;
  scope?: 'USER' | 'GROUP' | 'WORKSPACE';
  config?: Record<string, unknown>;
  enabled?: boolean;
}) => apiFetch<ApiStorageMapping>('/storage/mappings', { method: 'POST', body });
export const updateStorageMapping = (id: string, body: Partial<{ name: string; mountPath: string; readOnly: boolean; enabled: boolean; config: Record<string, unknown> }>) =>
  apiFetch<ApiStorageMapping>(`/storage/mappings/${id}`, { method: 'PATCH', body });
export const deleteStorageMapping = (id: string) =>
  apiFetch<{ ok: true }>(`/storage/mappings/${id}`, { method: 'DELETE' });

// ── Database backups ──────────────────────────────────────────────────────────

export interface ApiBackup {
  id: string;
  filename: string;
  bytes: number;
  status: string;
  createdAt: string;
}
export const getBackups = () => apiFetch<ApiBackup[]>('/backups');
export const runBackup = () => apiFetch<ApiBackup>('/backups/run', { method: 'POST' });

// ── Connectivity: connection proxies ──────────────────────────────────────────

export interface ApiConnectionProxy {
  id: string;
  name: string;
  type: 'GUACAMOLE';
  host: string | null;
  port: number | null;
  enabled: boolean;
  config: Record<string, unknown>;
}
export const getConnectionProxies = () => apiFetch<ApiConnectionProxy[]>('/connectivity/proxies');
export const createConnectionProxy = (body: { name: string; host?: string; port?: number; enabled?: boolean }) =>
  apiFetch<ApiConnectionProxy>('/connectivity/proxies', { method: 'POST', body });
export const updateConnectionProxy = (id: string, body: Partial<{ host: string; port: number; enabled: boolean }>) =>
  apiFetch<ApiConnectionProxy>(`/connectivity/proxies/${id}`, { method: 'PATCH', body });
export const deleteConnectionProxy = (id: string) =>
  apiFetch<{ ok: true }>(`/connectivity/proxies/${id}`, { method: 'DELETE' });

// ── Connectivity: web filters ─────────────────────────────────────────────────

export interface ApiWebFilter {
  id: string;
  name: string;
  categories: Record<string, unknown>;
  cacheTtl: number;
  enabled: boolean;
}
export const getWebFilters = () => apiFetch<ApiWebFilter[]>('/connectivity/filters');
export const createWebFilter = (body: { name: string; categories?: Record<string, unknown>; cacheTtl?: number; enabled?: boolean }) =>
  apiFetch<ApiWebFilter>('/connectivity/filters', { method: 'POST', body });
export const updateWebFilter = (id: string, body: Partial<{ categories: Record<string, unknown>; cacheTtl: number; enabled: boolean }>) =>
  apiFetch<ApiWebFilter>(`/connectivity/filters/${id}`, { method: 'PATCH', body });
export const deleteWebFilter = (id: string) =>
  apiFetch<{ ok: true }>(`/connectivity/filters/${id}`, { method: 'DELETE' });
export const getSquidConfig = (id: string) =>
  apiFetch<{ filename: string; content: string }>(`/connectivity/filters/${id}/squid-config`);

// ── Connectivity: browser isolation ───────────────────────────────────────────

export interface ApiBrowserIsolation {
  id: string;
  name: string;
  forwardProxy: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
}
export const getBrowserIsolation = () => apiFetch<ApiBrowserIsolation[]>('/connectivity/isolation');
export const createBrowserIsolation = (body: { name: string; forwardProxy?: string; config?: Record<string, unknown>; enabled?: boolean }) =>
  apiFetch<ApiBrowserIsolation>('/connectivity/isolation', { method: 'POST', body });
export const updateBrowserIsolation = (id: string, body: Partial<{ forwardProxy: string; config: Record<string, unknown>; enabled: boolean }>) =>
  apiFetch<ApiBrowserIsolation>(`/connectivity/isolation/${id}`, { method: 'PATCH', body });
export const deleteBrowserIsolation = (id: string) =>
  apiFetch<{ ok: true }>(`/connectivity/isolation/${id}`, { method: 'DELETE' });

// ── Connectivity: egress gateways ─────────────────────────────────────────────

export interface ApiEgressGateway {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
export const getEgressGateways = () => apiFetch<ApiEgressGateway[]>('/connectivity/egress');
export const createEgressGateway = (body: { name: string; provider: string; config?: Record<string, unknown>; enabled?: boolean }) =>
  apiFetch<ApiEgressGateway>('/connectivity/egress', { method: 'POST', body });
export const updateEgressGateway = (id: string, body: Partial<{ config: Record<string, unknown>; enabled: boolean }>) =>
  apiFetch<ApiEgressGateway>(`/connectivity/egress/${id}`, { method: 'PATCH', body });
export const deleteEgressGateway = (id: string) =>
  apiFetch<{ ok: true }>(`/connectivity/egress/${id}`, { method: 'DELETE' });
export const getWireguardConfig = (id: string) =>
  apiFetch<{ filename: string; content: string }>(`/connectivity/egress/${id}/wireguard-config`);

// ── Settings: branding, general, config import/export ─────────────────────────

export interface ApiBranding {
  productName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  primaryColor: string;
  accentColor: string;
  customCss: string | null;
}
export const getBranding = () => apiFetch<ApiBranding>('/settings/branding');
export const upsertBranding = (body: Partial<ApiBranding>) =>
  apiFetch<ApiBranding>('/settings/branding', { method: 'PUT', body });

export interface ApiSetting {
  id: string;
  key: string;
  valueJson: unknown;
  updatedAt: string;
}
export const getGeneralSettings = () => apiFetch<ApiSetting[]>('/settings/general');
export const upsertGeneralSettings = (settings: { key: string; value: unknown }[]) =>
  apiFetch<ApiSetting[]>('/settings/general', { method: 'PUT', body: { settings } });

export interface ApiConfigExport {
  version: number;
  exportedAt: string;
  branding: Partial<ApiBranding> | null;
  settings: { key: string; value: unknown }[];
}
export const exportConfig = () => apiFetch<ApiConfigExport>('/settings/config/export');
export const importConfig = (body: { branding?: Partial<ApiBranding>; settings?: { key: string; value: unknown }[] }) =>
  apiFetch<{ ok: true }>('/settings/config/import', { method: 'POST', body });

// ── Banners / watermarks ──────────────────────────────────────────────────────

export interface ApiBannerConfig {
  id: string;
  scope: 'USER' | 'GROUP' | 'WORKSPACE';
  refId: string | null;
  bannerText: string | null;
  bannerColor: string | null;
  watermarkText: string | null;
  watermarkOpacity: number;
}
export const getBanners = () => apiFetch<ApiBannerConfig[]>('/watermarks');
export const upsertBanner = (body: {
  scope?: 'USER' | 'GROUP' | 'WORKSPACE';
  refId?: string;
  bannerText?: string;
  bannerColor?: string;
  watermarkText?: string;
  watermarkOpacity?: number;
}) => apiFetch<ApiBannerConfig>('/watermarks', { method: 'PUT', body });
export const deleteBanner = (id: string) =>
  apiFetch<{ ok: true }>(`/watermarks/${id}`, { method: 'DELETE' });

// ── Feedback / bug reports + the shared triage "memory" ───────────────────────

export interface ApiFeedbackNote {
  author: string;
  body: string;
  at: string;
}
export interface ApiFeedback {
  id: string;
  orgId: string;
  userId: string | null;
  kind: 'BUG' | 'FEEDBACK';
  message: string;
  pageUrl: string | null;
  screenshot: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'WONTFIX';
  notes: ApiFeedbackNote[];
  createdAt: string;
  updatedAt: string;
}
/** Create echoes back only the lightweight fields (no screenshot). */
export const createFeedback = (body: {
  kind: 'BUG' | 'FEEDBACK';
  message: string;
  pageUrl?: string;
  screenshot?: string;
}) =>
  apiFetch<{ id: string; kind: string; status: string; createdAt: string }>('/feedback', {
    method: 'POST',
    body,
  });
export const getFeedback = (status?: string) =>
  apiFetch<ApiFeedback[]>(`/feedback${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const updateFeedback = (id: string, body: { status?: string; note?: string }) =>
  apiFetch<ApiFeedback>(`/feedback/${id}`, { method: 'PATCH', body });
export const deleteFeedback = (id: string) =>
  apiFetch<{ ok: true }>(`/feedback/${id}`, { method: 'DELETE' });

// ── WebAuthn / passkeys ───────────────────────────────────────────────────────

export interface ApiPasskey {
  id: string;
  deviceName: string;
  createdAt: string;
}
// Registration (authenticated)
export const getPasskeyRegistrationOptions = () =>
  apiFetch<Record<string, unknown>>('/auth/webauthn/register/options', { method: 'POST' });
export const verifyPasskeyRegistration = (response: unknown, deviceName?: string) =>
  apiFetch<{ verified: boolean }>('/auth/webauthn/register/verify', { method: 'POST', body: { response, deviceName } });
export const getPasskeys = () => apiFetch<ApiPasskey[]>('/auth/webauthn/credentials');
export const deletePasskey = (id: string) =>
  apiFetch<{ ok: true }>(`/auth/webauthn/credentials/${id}`, { method: 'DELETE' });
// Authentication (public)
export const getPasskeyLoginOptions = (email: string) =>
  apiFetch<Record<string, unknown>>('/auth/webauthn/login/options', { method: 'POST', body: { email }, auth: false });
export const verifyPasskeyLogin = (email: string, response: unknown) =>
  apiFetch<ApiLoginResponse>('/auth/webauthn/login/verify', { method: 'POST', body: { email, response }, auth: false });

// ── Bug reports + fix memory ──────────────────────────────────────────────────
// The API returns BugReport rows whose field names match BugReportRow, so the
// live hooks pass them through directly.

export const getBugReports = (params?: {
  status?: BugStatus;
  severity?: string;
  source?: string;
  q?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.severity) qs.set('severity', params.severity);
  if (params?.source) qs.set('source', params.source);
  if (params?.q) qs.set('q', params.q);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch<BugReportRow[]>(`/bug-reports${suffix}`);
};
export const getBugStats = () => apiFetch<BugStats>('/bug-reports/stats');
export const getBugReport = (id: string) => apiFetch<BugReportRow>(`/bug-reports/${id}`);
export const getBugKnowledge = (q?: string) =>
  apiFetch<BugFixRow[]>(`/bug-reports/knowledge${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const submitBugReport = (body: BugReportInput) =>
  apiFetch<BugReportRow>('/bug-reports', { method: 'POST', body });
export const updateBugReport = (id: string, body: { status?: BugStatus; severity?: string }) =>
  apiFetch<BugReportRow>(`/bug-reports/${id}`, { method: 'PATCH', body });
export const resolveBugReport = (id: string, body: BugResolveInput) =>
  apiFetch<BugReportRow>(`/bug-reports/${id}/resolve`, { method: 'POST', body });
export const deleteBugReport = (id: string) =>
  apiFetch<{ ok: true }>(`/bug-reports/${id}`, { method: 'DELETE' });
/** Fire-and-forget intake for an automatically-captured client error. */
export const ingestClientError = (body: ClientErrorInput & { appVersion?: string }) =>
  apiFetch<{ errorCode: string }>('/bug-reports/ingest', { method: 'POST', body });

// ── Maintenance / automation scheduler ────────────────────────────────────────

export const getMaintenanceTasks = () => apiFetch<MaintenanceTaskRow[]>('/maintenance');
export const getMaintenanceCatalog = () => apiFetch<MaintenanceCatalogEntry[]>('/maintenance/catalog');
export const getMaintenanceRuns = (id: string) => apiFetch<MaintenanceRunRow[]>(`/maintenance/${id}/runs`);
export const createMaintenanceTask = (body: MaintenanceTaskInput) =>
  apiFetch<MaintenanceTaskRow>('/maintenance', { method: 'POST', body });
export const updateMaintenanceTask = (id: string, body: Partial<MaintenanceTaskInput>) =>
  apiFetch<MaintenanceTaskRow>(`/maintenance/${id}`, { method: 'PATCH', body });
export const deleteMaintenanceTask = (id: string) =>
  apiFetch<{ ok: true }>(`/maintenance/${id}`, { method: 'DELETE' });
export const runMaintenanceTask = (id: string) =>
  apiFetch<MaintenanceRunResult>(`/maintenance/${id}/run`, { method: 'POST' });

// ── Tariffs (time-based metering & limits) ────────────────────────────────────
export type TariffPeriod = 'MINUTE' | 'HOUR' | 'MONTH';
export interface ApiTariff {
  id: string;
  name: string;
  period: TariffPeriod;
  budgetMinutes: number | null;
  maxSessionMinutes: number | null;
  maxConcurrent: number | null;
  isDefault: boolean;
}
/** The signed-in user's own budget (null = unlimited / no tariff). */
export interface ApiMyTariff {
  tariffId: string;
  name: string;
  period: TariffPeriod;
  budgetMinutes: number | null;
  maxSessionMinutes: number | null;
  maxConcurrent: number | null;
  assignmentId: string;
  remainingSeconds: number;
}
export interface UpsertTariffInput {
  id?: string;
  name: string;
  period: TariffPeriod;
  budgetMinutes?: number | null;
  maxSessionMinutes?: number | null;
  maxConcurrent?: number | null;
  isDefault?: boolean;
}
export interface ApiTariffAssignment {
  id: string;
  tariffId: string;
  subjectType: 'ORG' | 'GROUP' | 'USER';
  subjectId: string;
  remainingSeconds: number;
}

export const getMyTariff = () => apiFetch<ApiMyTariff | null>('/tariffs/me');
export const getTariffs = () => apiFetch<ApiTariff[]>('/tariffs');
export const getTariffAssignments = () => apiFetch<ApiTariffAssignment[]>('/tariffs/assignments');
export const upsertTariff = (body: UpsertTariffInput) =>
  apiFetch<ApiTariff>('/tariffs', { method: 'PUT', body });
export const deleteTariff = (id: string) =>
  apiFetch<{ ok: true }>(`/tariffs/${id}`, { method: 'DELETE' });
export const assignTariff = (body: { tariffId: string; subjectType: 'ORG' | 'GROUP' | 'USER'; subjectId: string }) =>
  apiFetch<ApiTariffAssignment>('/tariffs/assign', { method: 'POST', body });
