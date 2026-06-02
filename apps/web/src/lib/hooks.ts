'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { store } from '@/lib/mock/store';

function useVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getServerVersion);
}

export function useDashboard() {
  const v = useVersion();
  return useMemo(() => store.getDashboard(), [v]);
}

export function useSessions() {
  const v = useVersion();
  return useMemo(() => store.getData().sessions, [v]);
}

export function useSession(id: string) {
  const v = useVersion();
  return useMemo(() => store.getData().sessions.find((s) => s.id === id || s.kasmId === id), [v, id]);
}

export function useAgents() {
  const v = useVersion();
  return useMemo(() => store.getData().agents, [v]);
}

export function useZones() {
  const v = useVersion();
  return useMemo(() => store.getData().zones, [v]);
}

export function useWorkspaces() {
  const v = useVersion();
  return useMemo(() => store.getData().workspaces, [v]);
}

export function useWorkspace(id: string) {
  const v = useVersion();
  return useMemo(() => store.getData().workspaces.find((w) => w.id === id), [v, id]);
}

export function useUsers() {
  const v = useVersion();
  return useMemo(() => store.getData().users, [v]);
}

export function useActivity() {
  const v = useVersion();
  return useMemo(() => store.getData().activity, [v]);
}

export function useTerminateSession() {
  return useCallback((id: string) => store.terminateSession(id), []);
}

export function useLaunchSession() {
  return useCallback((workspaceId: string) => store.launchSession(workspaceId), []);
}
