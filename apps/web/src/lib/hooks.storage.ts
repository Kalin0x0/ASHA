'use client';

/**
 * Feature hooks for the storage + session-sharing admin pages.
 *
 * These pages render in both data modes:
 *   • live → react-query against the NestJS storage / sharing endpoints
 *   • mock → a deterministic in-memory store seeded with realistic rows
 *
 * The hooks are always react-query hooks (so the rules of hooks hold); only the
 * query/mutation *function* branches on `isLive`. This keeps every page wired to
 * one code path regardless of mode and gives mock mode rich, interactive data.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/endpoints';
import type {
  ApiFileMapping,
  ApiPersistentProfile,
  ApiSessionShare,
  ApiVolumeMapping,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

// ── Mock store (module-level; survives navigation within a session) ──────────

const mockVolumes: ApiVolumeMapping[] = [
  { id: 'vol-shared-datasets', name: 'shared-datasets', hostPath: '/srv/asha/datasets', destPath: '/data/datasets', readOnly: true },
  { id: 'vol-team-models', name: 'team-models', hostPath: 'asha_models', destPath: '/opt/models', readOnly: true },
  { id: 'vol-scratch', name: 'scratch-rw', hostPath: '/mnt/nvme/scratch', destPath: '/scratch', readOnly: false },
];

const mockFiles: ApiFileMapping[] = [
  {
    id: 'file-corp-ca',
    name: 'corp-root-ca',
    target: 'CONTAINER',
    sourcePath: 'secrets://pki/corp-root-ca.crt',
    destPath: '/usr/local/share/ca-certificates/corp-root-ca.crt',
    owner: 'root',
    group: 'root',
    mode: '0644',
    isHomeProfile: false,
    scope: 'WORKSPACE',
  },
  {
    id: 'file-ssh-known-hosts',
    name: 'ssh-known-hosts',
    target: 'CONTAINER',
    sourcePath: 'config://ssh/known_hosts',
    destPath: '/home/kasm-user/.ssh/known_hosts',
    owner: 'kasm-user',
    group: 'kasm-user',
    mode: '0600',
    isHomeProfile: true,
    scope: 'USER',
  },
  {
    id: 'file-git-config',
    name: 'git-config',
    target: 'CONTAINER',
    sourcePath: 'config://git/gitconfig',
    destPath: '/home/kasm-user/.gitconfig',
    owner: 'kasm-user',
    group: 'kasm-user',
    mode: '0644',
    isHomeProfile: true,
    scope: 'GROUP',
  },
];

const mockProfiles: ApiPersistentProfile[] = [
  {
    id: 'prof-shahin-chrome',
    userId: 'user-1',
    workspaceId: 'ws-chrome',
    volumeName: 'profile-shahin-chrome',
    backend: 'DOCKER_VOLUME',
    sizeLimitMb: 5120,
    lastUsedAt: new Date(Date.now() - 36e5).toISOString(),
  },
  {
    id: 'prof-leila-vscode',
    userId: 'user-2',
    workspaceId: 'ws-vscode',
    volumeName: 'profile-leila-vscode',
    backend: 'DOCKER_VOLUME',
    sizeLimitMb: 10240,
    lastUsedAt: new Date(Date.now() - 864e5).toISOString(),
  },
  {
    id: 'prof-darius-design',
    userId: 'user-3',
    workspaceId: 'ws-gimp',
    volumeName: 'profile-darius-design',
    backend: 'S3',
    sizeLimitMb: null,
    lastUsedAt: new Date(Date.now() - 6 * 864e5).toISOString(),
  },
];

const mockShares: ApiSessionShare[] = [
  {
    id: 'share-1',
    sessionId: 'sess-204881',
    shareKey: 'sk_live_a91f4c2e7b6d',
    allowControl: true,
    requireAuth: true,
    enableChat: true,
    enableAv: true,
    expiresAt: new Date(Date.now() + 42 * 6e4).toISOString(),
    createdAt: new Date(Date.now() - 18 * 6e4).toISOString(),
    ownerName: 'Shahin Naiemi',
    workspaceName: 'Chrome Browser',
    participantCount: 2,
  },
  {
    id: 'share-2',
    sessionId: 'sess-198322',
    shareKey: 'sk_live_3d7e0b9a1f88',
    allowControl: false,
    requireAuth: false,
    enableChat: true,
    enableAv: false,
    expiresAt: new Date(Date.now() + 3 * 36e5).toISOString(),
    createdAt: new Date(Date.now() - 95 * 6e4).toISOString(),
    ownerName: 'Leila Ahmadi',
    workspaceName: 'VS Code',
    participantCount: 1,
  },
  {
    id: 'share-3',
    sessionId: 'sess-176540',
    shareKey: 'sk_live_c0a4f2189e5b',
    allowControl: false,
    requireAuth: true,
    enableChat: false,
    enableAv: false,
    expiresAt: null,
    createdAt: new Date(Date.now() - 5 * 36e5).toISOString(),
    ownerName: 'Darius Mehrabi',
    workspaceName: 'GIMP Studio',
    participantCount: 0,
  },
];

// ── Volume mappings ──────────────────────────────────────────────────────────

const VOLUMES_KEY = ['storage', 'volumes'] as const;

export function useVolumeMappings() {
  return useQuery({
    queryKey: VOLUMES_KEY,
    queryFn: () => (isLive ? api.getVolumeMappings() : Promise.resolve([...mockVolumes])),
  });
}

export function useCreateVolumeMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Parameters<typeof api.createVolumeMapping>[0]) => {
      if (isLive) return api.createVolumeMapping(body);
      const row: ApiVolumeMapping = {
        id: rid('vol'),
        name: body.name,
        hostPath: body.hostPath,
        destPath: body.destPath,
        readOnly: body.readOnly ?? false,
      };
      mockVolumes.unshift(row);
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VOLUMES_KEY }),
  });
}

export function useDeleteVolumeMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isLive) return api.deleteVolumeMapping(id);
      const i = mockVolumes.findIndex((v) => v.id === id);
      if (i >= 0) mockVolumes.splice(i, 1);
      return { ok: true as const };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VOLUMES_KEY }),
  });
}

// ── File mappings ────────────────────────────────────────────────────────────

const FILES_KEY = ['storage', 'files'] as const;

export function useFileMappings() {
  return useQuery({
    queryKey: FILES_KEY,
    queryFn: () => (isLive ? api.getFileMappings() : Promise.resolve([...mockFiles])),
  });
}

export function useCreateFileMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Parameters<typeof api.createFileMapping>[0]) => {
      if (isLive) return api.createFileMapping(body);
      const row: ApiFileMapping = {
        id: rid('file'),
        name: body.name,
        target: body.target ?? 'CONTAINER',
        sourcePath: body.sourcePath,
        destPath: body.destPath,
        owner: body.owner ?? null,
        group: body.group ?? null,
        mode: body.mode ?? null,
        isHomeProfile: body.isHomeProfile ?? false,
        scope: body.scope ?? 'WORKSPACE',
      };
      mockFiles.unshift(row);
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FILES_KEY }),
  });
}

export function useDeleteFileMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isLive) return api.deleteFileMapping(id);
      const i = mockFiles.findIndex((f) => f.id === id);
      if (i >= 0) mockFiles.splice(i, 1);
      return { ok: true as const };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FILES_KEY }),
  });
}

// ── Persistent profiles ──────────────────────────────────────────────────────

const PROFILES_KEY = ['storage', 'profiles'] as const;

export function usePersistentProfiles() {
  return useQuery({
    queryKey: PROFILES_KEY,
    queryFn: () => (isLive ? api.getPersistentProfiles() : Promise.resolve([...mockProfiles])),
  });
}

export function useCreatePersistentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Parameters<typeof api.createPersistentProfile>[0]) => {
      if (isLive) return api.createPersistentProfile(body);
      const row: ApiPersistentProfile = {
        id: rid('prof'),
        userId: body.userId ?? null,
        workspaceId: body.workspaceId ?? null,
        volumeName: body.volumeName,
        backend: body.backend ?? 'DOCKER_VOLUME',
        sizeLimitMb: body.sizeLimitMb ?? null,
        lastUsedAt: null,
      };
      mockProfiles.unshift(row);
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useDeletePersistentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (isLive) return api.deletePersistentProfile(id);
      const i = mockProfiles.findIndex((p) => p.id === id);
      if (i >= 0) mockProfiles.splice(i, 1);
      return { ok: true as const };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

// ── Session shares ───────────────────────────────────────────────────────────

const SHARES_KEY = ['sessions', 'shares'] as const;

export function useSessionShares() {
  return useQuery({
    queryKey: SHARES_KEY,
    // Live: there is no org-wide "list all shares" endpoint yet (sharing is
    // per-session: GET /sessions/:id/share). Return [] honestly until one
    // exists. Mock mode shows the seeded active shares.
    queryFn: () => (isLive ? Promise.resolve<ApiSessionShare[]>([]) : Promise.resolve([...mockShares])),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (share: ApiSessionShare) => {
      if (isLive) return api.revokeShare(share.sessionId);
      const i = mockShares.findIndex((s) => s.id === share.id);
      if (i >= 0) mockShares.splice(i, 1);
      return { ok: true as const };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SHARES_KEY }),
  });
}

// Re-export the API row types so pages import everything from one place.
export type { ApiFileMapping, ApiPersistentProfile, ApiSessionShare, ApiVolumeMapping };
