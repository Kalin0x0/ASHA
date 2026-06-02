'use client';

import type { SessionStatus } from '@/lib/types';
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
  userId: string;
  workspaceId: string;
  zoneId: string;
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

export interface ApiWorkspace {
  id: string;
  name: string;
  friendlyName: string;
  description: string | null;
  imageId: string | null;
  iconUrl: string | null;
  categories: string[];
  enabled: boolean;
  coresLimit: number | null;
  memLimitMb: number | null;
  gpuCount: number;
  image: ApiImage | null;
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
  lastLoginAt: string | null;
  groups: { group: { name: string } }[];
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function login(body: { email: string; password: string; totp?: string }) {
  return apiFetch<ApiLoginResponse>('/auth/login', { method: 'POST', body, auth: false });
}

export function getMe() {
  return apiFetch<AuthUser>('/auth/me');
}

export function logout(refreshToken: string | null) {
  return apiFetch<{ ok: true }>('/auth/logout', {
    method: 'POST',
    body: { refreshToken: refreshToken ?? undefined },
  });
}

// ── Resources ─────────────────────────────────────────────────────────────────

export const getSessions = () => apiFetch<ApiSession[]>('/sessions');
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

export const getWorkspaces = () => apiFetch<ApiWorkspace[]>('/workspaces');
export const getLaunchableWorkspaces = () => apiFetch<ApiWorkspace[]>('/workspaces/launchable');
export const getAgents = () => apiFetch<ApiAgent[]>('/agents');
export const getZones = () => apiFetch<ApiZone[]>('/zones');
export const getUsers = () => apiFetch<ApiUser[]>('/users');

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
export const getFileMappings = () => apiFetch<ApiFileMapping[]>('/storage/files');
export const getPersistentProfiles = () => apiFetch<ApiPersistentProfile[]>('/storage/profiles');

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

// SSO group mappings — map an IdP attribute/value onto a Chista group.
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
  zone?: { name: string } | null;
}

export const getServers = () => apiFetch<ApiServer[]>('/servers');
export const createServer = (body: {
  zoneId: string;
  hostname: string;
  address: string;
  connectionType?: 'SSH' | 'RDP' | 'VNC';
  authMode?: 'PASSWORD' | 'KEY' | 'VMWARE_TEMPLATE';
  continuity?: 'NONE' | 'TMUX' | 'SCREEN';
  maxSessions?: number;
}) => apiFetch<ApiServer>('/servers', { method: 'POST', body });
export const updateServer = (id: string, body: Partial<{ hostname: string; address: string; maxSessions: number }>) =>
  apiFetch<ApiServer>(`/servers/${id}`, { method: 'PATCH', body });
export const deleteServer = (id: string) =>
  apiFetch<{ ok: true }>(`/servers/${id}`, { method: 'DELETE' });

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
  apiFetch<{ config: string }>(`/log-forwarders/${id}/fluent-bit-config`);

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
  status: number | null;
  success: boolean;
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
  apiFetch<{ ok: boolean; status?: number }>(`/webhooks/${id}/test`, { method: 'POST' });

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
export const runBackup = () => apiFetch<{ ok: boolean; id?: string }>('/backups/run', { method: 'POST' });

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
  apiFetch<{ config: string }>(`/connectivity/filters/${id}/squid-config`);

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
  apiFetch<{ config: string }>(`/connectivity/egress/${id}/wireguard-config`);
