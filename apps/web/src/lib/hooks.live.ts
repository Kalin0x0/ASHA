'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import * as api from '@/lib/api/endpoints';
import { deriveDashboard, mapAgent, mapSession, mapUser, mapWorkspace, toMap } from '@/lib/api/map';
import type { ActivityItem, Agent, CreateUserInput, CreateWorkspaceInput, RecordingRow, ServerOption, SessionRow, UserRow, Workspace, Zone } from '@/lib/types';

const SESSIONS_KEY = ['sessions'] as const;
const WORKSPACES_KEY = ['workspaces'] as const;
const AGENTS_KEY = ['agents'] as const;
const ZONES_KEY = ['zones'] as const;
const USERS_KEY = ['users'] as const;

// ── Base queries (shared + cached; joins compose them) ───────────────────────

function useSessionsQuery() {
  return useQuery({ queryKey: SESSIONS_KEY, queryFn: api.getSessions, refetchInterval: 8_000 });
}
function useWorkspacesQuery() {
  return useQuery({ queryKey: WORKSPACES_KEY, queryFn: api.getWorkspaces });
}
function useAgentsQuery() {
  return useQuery({ queryKey: AGENTS_KEY, queryFn: api.getAgents, refetchInterval: 12_000 });
}
function useZonesQuery() {
  return useQuery({ queryKey: ZONES_KEY, queryFn: api.getZones });
}
function useUsersQuery() {
  return useQuery({ queryKey: USERS_KEY, queryFn: api.getUsers });
}

// ── Public hooks (match the mock signatures) ─────────────────────────────────

export function useSessions(): SessionRow[] {
  const sessions = useSessionsQuery().data;
  const users = useUsersQuery().data;
  const zones = useZonesQuery().data;
  const agents = useAgentsQuery().data;
  const workspaces = useWorkspacesQuery().data;
  return useMemo(() => {
    if (!sessions) return [];
    const lk = {
      users: toMap(users ?? []),
      zones: toMap(zones ?? []),
      agents: toMap(agents ?? []),
      workspaces: toMap(workspaces ?? []),
    };
    return sessions.map((s) => mapSession(s, lk));
  }, [sessions, users, zones, agents, workspaces]);
}

export function useSession(id: string): SessionRow | undefined {
  const users = useUsersQuery().data;
  const zones = useZonesQuery().data;
  const agents = useAgentsQuery().data;
  const workspaces = useWorkspacesQuery().data;
  const { data } = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id),
    enabled: Boolean(id),
    // Poll fast while provisioning, slow once the stream is live.
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 15_000 : 4_000),
  });
  return useMemo(() => {
    if (!data) return undefined;
    const lk = {
      users: toMap(users ?? []),
      zones: toMap(zones ?? []),
      agents: toMap(agents ?? []),
      workspaces: toMap(workspaces ?? []),
    };
    return mapSession(data, lk);
  }, [data, users, zones, agents, workspaces]);
}

export function useAgents(): Agent[] {
  const { data } = useAgentsQuery();
  return useMemo(() => (data ?? []).map(mapAgent), [data]);
}

export function useWorkspaces(): Workspace[] {
  const { data } = useWorkspacesQuery();
  const sessions = useSessionsQuery().data;
  return useMemo(() => {
    const active = new Map<string, number>();
    for (const s of sessions ?? []) {
      if (s.status === 'RUNNING' || s.status === 'DEGRADED') {
        active.set(s.workspaceId, (active.get(s.workspaceId) ?? 0) + 1);
      }
    }
    return (data ?? []).map((w) => mapWorkspace(w, active.get(w.id) ?? 0));
  }, [data, sessions]);
}

export function useWorkspace(id: string): Workspace | undefined {
  return useWorkspaces().find((w) => w.id === id);
}

export function useZones(): Zone[] {
  const zones = useZonesQuery().data;
  const agents = useAgentsQuery().data;
  const sessions = useSessionsQuery().data;
  return useMemo(() => {
    return (zones ?? []).map((z) => {
      const zoneAgents = (agents ?? []).filter((a) => a.zoneId === z.id);
      const online = zoneAgents.filter((a) => a.status === 'ONLINE').length;
      const zoneSessions = (sessions ?? []).filter(
        (s) => s.zoneId === z.id && (s.status === 'RUNNING' || s.status === 'DEGRADED'),
      ).length;
      const status: Zone['status'] =
        zoneAgents.length === 0 ? 'offline' : online === 0 ? 'degraded' : 'healthy';
      return {
        id: z.id,
        name: z.name,
        region: z.region ?? '—',
        agents: zoneAgents.length,
        sessions: zoneSessions,
        status,
      };
    });
  }, [zones, agents, sessions]);
}

export function useUsers(): UserRow[] {
  const { data } = useUsersQuery();
  return useMemo(() => (data ?? []).map(mapUser), [data]);
}

export function useServers(): ServerOption[] {
  const { data } = useQuery({ queryKey: ['servers'], queryFn: api.getServers });
  return useMemo(
    () =>
      (data ?? []).map((s) => ({
        id: s.id,
        hostname: s.hostname,
        connectionType: (s.connectionType as ServerOption['connectionType']) ?? 'RDP',
        zoneName: s.zone?.name ?? '—',
      })),
    [data],
  );
}

export function useCreateUser() {
  const qc = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
  return useCallback(
    async (input: CreateUserInput): Promise<UserRow> => mapUser(await mutateAsync(input)),
    [mutateAsync],
  );
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: (input: CreateWorkspaceInput) =>
      api.createWorkspace({
        name:
          input.name?.trim() ||
          input.friendlyName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') ||
          'workspace',
        friendlyName: input.friendlyName.trim(),
        description: input.description?.trim() || undefined,
        iconUrl: input.iconUrl?.trim() || undefined,
        categories: input.category?.trim() ? [input.category.trim()] : [],
        coresLimit: input.cores,
        memLimitMb: input.memMb,
        gpuCount: input.gpu,
        dockerImage: input.dockerImage?.trim() || undefined,
        enabled: input.enabled,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKSPACES_KEY }),
  });
  return useCallback(
    async (input: CreateWorkspaceInput): Promise<Workspace> => mapWorkspace(await mutateAsync(input)),
    [mutateAsync],
  );
}

export function useDashboard() {
  const sessions = useSessions();
  const agents = useAgents();
  return useMemo(() => deriveDashboard(sessions, agents), [sessions, agents]);
}

export function useActivity(): ActivityItem[] {
  // No audit-log endpoint is exposed yet; live activity feed is empty for now.
  return [];
}

export function useImages() {
  // Images API endpoint not yet implemented; return empty until Phase 3.
  return [];
}

export function useSessionHistory() {
  // History/audit endpoint not yet implemented; return empty until Phase 3.
  return [];
}

export function useRecordings(): RecordingRow[] {
  const { data } = useQuery({ queryKey: ['recordings'], queryFn: api.getRecordings, refetchInterval: 15_000 });
  return useMemo(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        workspaceName: r.sessionId.slice(0, 8),
        user: '—',
        protocol: r.protocol,
        status: r.status,
        sizeMb: Math.round(Number(r.bytes) / (1024 * 1024)),
        durationSec: r.durationSec,
        startedAt: r.startedAt,
      })),
    [data],
  );
}

export function useTerminateSession() {
  const qc = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: api.terminateSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
  return useCallback((id: string) => mutate(id), [mutate]);
}

export function useLaunchSession() {
  const qc = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: api.createSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
  return useCallback(
    async (workspaceId: string): Promise<SessionRow | null> => {
      try {
        const s = await mutateAsync(workspaceId);
        return mapSession(s, {
          users: new Map(),
          zones: new Map(),
          agents: new Map(),
          workspaces: new Map(),
        });
      } catch {
        return null;
      }
    },
    [mutateAsync],
  );
}
