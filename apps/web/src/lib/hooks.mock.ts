'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ApiGroup, RdpFileOptions } from '@/lib/api/endpoints';
import { store } from '@/lib/mock/store';
import { buildMockRdpFile, downloadRdpFile } from '@/lib/rdp';
import type {
  BugReportInput,
  BugResolveInput,
  BugStatus,
  CreateFeedbackInput,
  CreateUserInput,
  CreateWorkspaceInput,
  MaintenanceRunRow,
  MaintenanceTaskInput,
  MaintenanceTaskRow,
  ManagedImage,
  UpdateFeedbackInput,
  UpdateWorkspaceInput,
  Workspace,
} from '@/lib/types';
// ServerOption is returned directly from the mock store (see useServers).

const ACTIVE: BugStatus[] = ['OPEN', 'TRIAGED', 'IN_PROGRESS'];

function useVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getServerVersion);
}

/**
 * Recomputes `select` against the mock store whenever the store emits (tracked
 * by the version counter) or any of `deps` change. The version is the memo's
 * invalidation key — it is deliberately not referenced inside `select`, so
 * exhaustive-deps is disabled for that one line.
 */
function useSnapshot<T>(select: () => T, deps: readonly unknown[] = []): T {
  const v = useVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(select, [v, ...deps]);
}

export function useDashboard() {
  return useSnapshot(() => store.getDashboard());
}

export function useSessions() {
  return useSnapshot(() => store.getData().sessions);
}

export function useSession(id: string) {
  return useSnapshot(() => store.getData().sessions.find((s) => s.id === id || s.kasmId === id), [id]);
}

export function useAgents() {
  return useSnapshot(() => store.getData().agents);
}

export function useZones() {
  return useSnapshot(() => store.getData().zones);
}

export function useServers() {
  return useSnapshot(() => store.getData().servers);
}

export function useWorkspaces() {
  return useSnapshot(() => store.getData().workspaces);
}

export function useWorkspace(id: string) {
  return useSnapshot(() => store.getData().workspaces.find((w) => w.id === id), [id]);
}

// Mock mode has no backend access control — the launchable set is the full set.
export function useLaunchableWorkspaces() {
  return useSnapshot(() => store.getData().workspaces);
}

// Mock groups for the assignment UI (no backend).
export function useGroups(): ApiGroup[] {
  return [
    { id: 'seed-group-all', name: 'All Users', description: null, priority: 1000, isDefault: true },
    { id: 'seed-group-admins', name: 'Administrators', description: null, priority: 1, isDefault: false },
  ];
}

export function useSetWorkspaceAssignments() {
  // No-op in mock mode (no backend to persist grants to).
  return useCallback(async (_id: string, _userIds: string[], _groupIds: string[]) => undefined, []);
}

export function useUsers() {
  return useSnapshot(() => store.getData().users);
}

export function useActivity() {
  return useSnapshot(() => store.getData().activity);
}

export function useImages(): ManagedImage[] {
  return useSnapshot(() => {
    const data = store.getData();
    const wsByName = new Map(data.workspaces.map((w) => [w.friendlyName, w] as const));
    return data.images.map((img) => ({
      id: img.id,
      name: img.name,
      friendlyName: img.name,
      dockerImage: img.fullImage,
      protocol: 'KASMVNC',
      digest: null,
      pullPolicy: 'ALWAYS' as const,
      createdAt: img.pulledAt,
      workspaces: img.workspaces.map((name) => {
        const w = wsByName.get(name);
        return { id: w?.id ?? name, friendlyName: name, cores: w?.cores ?? null, memMb: w?.memMb ?? null, gpu: w?.gpu ?? 0 };
      }),
    }));
  });
}

export function useDeleteImage() {
  return useCallback(async (id: string) => {
    store.deleteImage(id);
    return { ok: true as const, hostImageRemoved: true, sharedWithOtherImages: false };
  }, []);
}

export function useReinstallImage() {
  // Reinstall re-pulls onto the agents (a live-backend concept); no-op in mock mode.
  return useCallback(async (id: string) => ({ ok: true as const, imageId: id, dockerImage: '' }), []);
}

export function useSetImagePullPolicy() {
  // Pull policy is a live-backend concept; no-op in mock mode.
  return useCallback(async (_id: string, _policy: ManagedImage['pullPolicy']) => {}, []);
}

export function useSessionHistory() {
  return useSnapshot(() => store.getData().history);
}

export function useRecordings() {
  // No recordings are seeded in mock mode; the page shows its empty state.
  return useSnapshot(() => store.getData().recordings);
}

export function useBugReports() {
  return useSnapshot(() => store.getData().bugReports);
}

export function useBugReport(id: string) {
  return useSnapshot(() => {
    const b = store.getData().bugReports.find((x) => x.id === id);
    if (!b) return undefined;
    // Surface a prior fix from the memory matching the same title.
    const knownFix = !b.fix
      ? store.getData().bugFixes.find((f) => f.title === b.title) ?? null
      : null;
    return { ...b, knownFix };
  }, [id]);
}

export function useBugFixes() {
  return useSnapshot(() => store.getData().bugFixes);
}

export function useBugStats() {
  return useSnapshot(() => {
    const reports = store.getData().bugReports;
    const isActive = (s: BugStatus) => ACTIVE.includes(s);
    return {
      open: reports.filter((b) => isActive(b.status)).length,
      critical: reports.filter((b) => b.severity === 'CRITICAL' && isActive(b.status)).length,
      automatic: reports.filter((b) => b.source === 'AUTOMATIC').length,
      resolved: reports.filter((b) => b.status === 'RESOLVED').length,
      knowledgeEntries: store.getData().bugFixes.length,
    };
  });
}

export function useSubmitBug() {
  return useCallback(async (input: BugReportInput) => {
    store.submitBug(input);
  }, []);
}

export function useUpdateBug() {
  return useCallback(
    async (id: string, patch: { status?: BugStatus; severity?: BugReportInput['severity'] }) => {
      store.updateBug(id, patch);
    },
    [],
  );
}

export function useResolveBug() {
  return useCallback(async (id: string, input: BugResolveInput) => {
    store.resolveBug(id, input);
  }, []);
}

export function useTerminateSession() {
  return useCallback((id: string) => store.terminateSession(id), []);
}

export function usePauseSession() {
  return useCallback((id: string) => store.pauseSession(id), []);
}

export function useResumeSession() {
  return useCallback((id: string) => store.resumeSession(id), []);
}

export function useLaunchSession() {
  return useCallback(async (workspaceId: string) => store.launchSession(workspaceId), []);
}

export function useCreateUser() {
  return useCallback(async (input: CreateUserInput) => store.createUser(input), []);
}

export function useCreateWorkspace() {
  return useCallback(async (input: CreateWorkspaceInput) => store.createWorkspace(input), []);
}

export function useUpdateWorkspace() {
  return useCallback(async (id: string, patch: UpdateWorkspaceInput) => store.updateWorkspace(id, patch), []);
}

export function useDeleteWorkspace() {
  return useCallback(async (id: string) => {
    store.deleteWorkspace(id);
  }, []);
}

export function useDownloadRdp() {
  return useCallback(async (workspace: Workspace, opts: RdpFileOptions = {}) => {
    const host = workspace.serverName ?? workspace.name;
    downloadRdpFile(`${host}.rdp`, buildMockRdpFile(host, 'Administrator', opts));
  }, []);
}

export function useFeedback(status?: string) {
  return useSnapshot(() => store.getFeedback(status), [status]);
}

export function useCreateFeedback() {
  return useCallback(async (input: CreateFeedbackInput) => store.createFeedback(input), []);
}

export function useUpdateFeedback() {
  return useCallback(
    async (id: string, patch: UpdateFeedbackInput) => store.updateFeedback(id, patch),
    [],
  );
}

// ── Maintenance / automation scheduler (isolated dev-only mock store) ─────────

const mtListeners = new Set<() => void>();
let mtVersion = 0;
let mtSeq = 1;
const mtNow = () => new Date().toISOString();
const mtEmit = () => {
  mtVersion += 1;
  for (const l of mtListeners) l();
};
const mtSubscribe = (cb: () => void) => {
  mtListeners.add(cb);
  return () => {
    mtListeners.delete(cb);
  };
};
const mtGetVersion = () => mtVersion;
const mtNextId = (prefix: string) => {
  mtSeq += 1;
  return `${prefix}-${mtSeq}`;
};

let mtTasks: MaintenanceTaskRow[] = [
  {
    id: 'mt-seed-1',
    name: 'Nightly dead-session cleanup',
    type: 'REAP_DEAD_SESSIONS',
    enabled: true,
    scheduleKind: 'DAILY',
    intervalMinutes: null,
    atMinuteOfDay: 3 * 60,
    weekday: null,
    params: {},
    lastRunAt: null,
    lastStatus: null,
    lastSummary: null,
    lastError: null,
    nextRunAt: mtNow(),
    runCount: 0,
    createdAt: mtNow(),
    updatedAt: mtNow(),
    runs: [],
  },
];

function useMt<T>(select: () => T): T {
  const v = useSyncExternalStore(mtSubscribe, mtGetVersion, () => 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(select, [v]);
}

export function useMaintenanceTasks(): MaintenanceTaskRow[] {
  return useMt(() => mtTasks);
}

export function useMaintenanceRuns(id: string): MaintenanceRunRow[] {
  return useMt(() => mtTasks.find((t) => t.id === id)?.runs ?? []);
}

export function useCreateMaintenanceTask() {
  return useCallback(async (input: MaintenanceTaskInput) => {
    const now = mtNow();
    const task: MaintenanceTaskRow = {
      id: mtNextId('mt'),
      name: input.name,
      type: input.type,
      enabled: input.enabled ?? true,
      scheduleKind: input.scheduleKind,
      intervalMinutes: input.intervalMinutes ?? null,
      atMinuteOfDay: input.atMinuteOfDay ?? null,
      weekday: input.weekday ?? null,
      params: input.params ?? {},
      lastRunAt: null,
      lastStatus: null,
      lastSummary: null,
      lastError: null,
      nextRunAt: now,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
      runs: [],
    };
    mtTasks = [...mtTasks, task];
    mtEmit();
    return task;
  }, []);
}

export function useUpdateMaintenanceTask() {
  return useCallback(async (id: string, patch: Partial<MaintenanceTaskInput>) => {
    let updated = mtTasks.find((t) => t.id === id) ?? mtTasks[0];
    mtTasks = mtTasks.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, ...patch, params: patch.params ?? t.params, updatedAt: mtNow() };
      return updated;
    });
    mtEmit();
    return updated;
  }, []);
}

export function useDeleteMaintenanceTask() {
  return useCallback(async (id: string) => {
    mtTasks = mtTasks.filter((t) => t.id !== id);
    mtEmit();
    return { ok: true as const };
  }, []);
}

export function useRunMaintenanceTask() {
  return useCallback(async (id: string) => {
    const now = mtNow();
    const run: MaintenanceRunRow = {
      id: mtNextId('run'),
      taskId: id,
      status: 'OK',
      trigger: 'MANUAL',
      startedAt: now,
      finishedAt: now,
      durationMs: 12,
      summary: 'Mock run complete',
      affected: 0,
      error: null,
      actorUserId: null,
    };
    mtTasks = mtTasks.map((t) =>
      t.id === id
        ? {
            ...t,
            lastRunAt: now,
            lastStatus: 'OK',
            lastSummary: run.summary,
            runCount: t.runCount + 1,
            runs: [run, ...(t.runs ?? [])].slice(0, 20),
          }
        : t,
    );
    mtEmit();
    return { run: run.id, status: 'OK', affected: 0, summary: run.summary };
  }, []);
}

export function useRegistries() {
  return useSnapshot(() => store.getRegistries());
}

export function useMarketplace() {
  return useSnapshot(() => store.getMarketplace());
}

export function useAddRegistry() {
  return useCallback(async (input: { name: string; url: string }) => store.addRegistry(input), []);
}

export function useDeleteRegistry() {
  return useCallback(async (id: string) => {
    store.deleteRegistry(id);
  }, []);
}

export function useSyncRegistry() {
  return useCallback(async (id: string) => store.syncRegistry(id), []);
}

export function useInstallEntry() {
  return useCallback(async (id: string) => {
    store.installEntry(id);
  }, []);
}

export function useReinstallEntry() {
  // Reinstall re-pulls onto the agents (live-backend concept); re-mark installed in mock.
  return useCallback(async (id: string) => {
    store.installEntry(id);
    return { ok: true as const, imageId: id, dockerImage: '' };
  }, []);
}

export function useUninstallEntry() {
  return useCallback(async (id: string) => {
    store.deleteImage(id);
    return { ok: true as const, hostImageRemoved: true, sharedWithOtherImages: false };
  }, []);
}
