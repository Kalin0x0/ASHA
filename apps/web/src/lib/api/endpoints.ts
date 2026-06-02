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
