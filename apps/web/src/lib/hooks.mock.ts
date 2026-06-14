'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { store } from '@/lib/mock/store';
import type {
  CreateFeedbackInput,
  CreateUserInput,
  CreateWorkspaceInput,
  UpdateFeedbackInput,
  UpdateWorkspaceInput,
} from '@/lib/types';
// ServerOption is returned directly from the mock store (see useServers).

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

export function useUsers() {
  return useSnapshot(() => store.getData().users);
}

export function useActivity() {
  return useSnapshot(() => store.getData().activity);
}

export function useImages() {
  return useSnapshot(() => store.getData().images);
}

export function useSessionHistory() {
  return useSnapshot(() => store.getData().history);
}

export function useRecordings() {
  // No recordings are seeded in mock mode; the page shows its empty state.
  return useSnapshot(() => store.getData().recordings);
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
