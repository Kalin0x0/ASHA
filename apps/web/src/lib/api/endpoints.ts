'use client';

import type { SessionStatus } from '@/lib/types';
import type { AuthTokens, AuthUser } from './auth-store';
import { apiFetch } from './client';

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
