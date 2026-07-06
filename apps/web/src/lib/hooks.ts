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
export const useOwnSessions = impl.useOwnSessions;
export const useMyTariff = impl.useMyTariff;
export const useSession = impl.useSession;
export const useAgents = impl.useAgents;
export const useZones = impl.useZones;
export const useServers = impl.useServers;
export const useWorkspaces = impl.useWorkspaces;
export const useWorkspace = impl.useWorkspace;
export const useLaunchableWorkspaces = impl.useLaunchableWorkspaces;
export const useGroups = impl.useGroups;
export const useSetWorkspaceAssignments = impl.useSetWorkspaceAssignments;
export const useUsers = impl.useUsers;
export const useActivity = impl.useActivity;
export const useImages = impl.useImages;
export const useDeleteImage = impl.useDeleteImage;
export const useReinstallImage = impl.useReinstallImage;
export const useSetImagePullPolicy = impl.useSetImagePullPolicy;
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
export const useDownloadRdp = impl.useDownloadRdp;
export const useFeedback = impl.useFeedback;
export const useCreateFeedback = impl.useCreateFeedback;
export const useUpdateFeedback = impl.useUpdateFeedback;
export const useRegistries = impl.useRegistries;
export const useMarketplace = impl.useMarketplace;
export const useAddRegistry = impl.useAddRegistry;
export const useDeleteRegistry = impl.useDeleteRegistry;
export const useSyncRegistry = impl.useSyncRegistry;
export const useInstallEntry = impl.useInstallEntry;
export const useReinstallEntry = impl.useReinstallEntry;
export const useUninstallEntry = impl.useUninstallEntry;
export const useBugReports = impl.useBugReports;
export const useBugReport = impl.useBugReport;
export const useBugFixes = impl.useBugFixes;
export const useBugStats = impl.useBugStats;
export const useSubmitBug = impl.useSubmitBug;
export const useUpdateBug = impl.useUpdateBug;
export const useResolveBug = impl.useResolveBug;
export const useMaintenanceTasks = impl.useMaintenanceTasks;
export const useMaintenanceRuns = impl.useMaintenanceRuns;
export const useCreateMaintenanceTask = impl.useCreateMaintenanceTask;
export const useUpdateMaintenanceTask = impl.useUpdateMaintenanceTask;
export const useDeleteMaintenanceTask = impl.useDeleteMaintenanceTask;
export const useRunMaintenanceTask = impl.useRunMaintenanceTask;
