'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { store } from '@/lib/mock/store';

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

export function useLaunchSession() {
  return useCallback(async (workspaceId: string) => store.launchSession(workspaceId), []);
}
