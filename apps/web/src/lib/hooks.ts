'use client';

/**
 * Data hooks barrel. `API_MODE` is a build-time constant, so the implementation
 * is chosen once at module load — every component calls exactly one impl's hook,
 * which keeps the rules of hooks intact across mock and live modes.
 *
 *   mock → deterministic in-memory store (no backend)
 *   live → react-query against the NestJS API (NEXT_PUBLIC_API_MODE=live)
 */
import { API_MODE } from '@/lib/api/mode';
import * as live from './hooks.live';
import * as mock from './hooks.mock';

const impl = API_MODE === 'live' ? live : mock;

export const useDashboard = impl.useDashboard;
export const useSessions = impl.useSessions;
export const useSession = impl.useSession;
export const useAgents = impl.useAgents;
export const useZones = impl.useZones;
export const useServers = impl.useServers;
export const useWorkspaces = impl.useWorkspaces;
export const useWorkspace = impl.useWorkspace;
export const useUsers = impl.useUsers;
export const useActivity = impl.useActivity;
export const useImages = impl.useImages;
export const useSessionHistory = impl.useSessionHistory;
export const useRecordings = impl.useRecordings;
export const useTerminateSession = impl.useTerminateSession;
export const usePauseSession = impl.usePauseSession;
export const useResumeSession = impl.useResumeSession;
export const useLaunchSession = impl.useLaunchSession;
export const useCreateUser = impl.useCreateUser;
export const useCreateWorkspace = impl.useCreateWorkspace;
export const useUpdateWorkspace = impl.useUpdateWorkspace;
export const useDeleteWorkspace = impl.useDeleteWorkspace;
