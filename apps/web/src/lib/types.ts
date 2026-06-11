export type SessionStatus =
  | 'REQUESTED'
  | 'SCHEDULED'
  | 'PROVISIONING'
  | 'RUNNING'
  | 'DEGRADED'
  | 'PAUSED'
  | 'TERMINATING'
  | 'DESTROYED'
  | 'ERROR';

export type AgentStatus = 'ONLINE' | 'OFFLINE' | 'DRAINING' | 'UNHEALTHY';

export type WorkspaceType = 'CONTAINER' | 'SERVER' | 'REMOTE_APP' | 'VM' | 'LINK';

/** A registered RDP/VNC/SSH machine the create dialog can bind a workspace to. */
export interface ServerOption {
  id: string;
  hostname: string;
  connectionType: 'RDP' | 'VNC' | 'SSH';
  zoneName: string;
}

export interface UpdateWorkspaceInput {
  friendlyName?: string;
  description?: string;
  category?: string;
  iconUrl?: string;
  cores?: number;
  memMb?: number;
  gpu?: number;
  enabled?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  friendlyName: string;
  description: string;
  category: string;
  iconUrl?: string;
  cores: number;
  memMb: number;
  gpu: number;
  enabled: boolean;
  dockerImage: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH';
  /** What the workspace runs on. */
  type: WorkspaceType;
  /** For server-backed workspaces: the bound machine's id (for the RDP-client download). */
  serverId?: string;
  /** For server-backed workspaces: the bound machine's hostname. */
  serverName?: string;
  /** Deployment zone name, when set (server zone or preferred zone). */
  zoneName?: string;
  activeSessions: number;
}

export interface SessionRow {
  id: string;
  kasmId: string;
  user: { id: string; name: string; email: string };
  workspaceName: string;
  workspaceIcon?: string;
  zone: string;
  agent: string;
  status: SessionStatus;
  cpuPct: number;
  memMb: number;
  memLimitMb: number;
  uptimeSec: number;
  createdAt: string;
  connectionType: string;
  /**
   * Public URL of the session's KasmVNC web client, embedded by the streaming
   * viewer. Populated once the session reaches RUNNING. Undefined while
   * provisioning, or in mock mode when no demo stream URL is configured.
   */
  connectionUrl?: string;
}

export interface Agent {
  id: string;
  hostname: string;
  zone: string;
  status: AgentStatus;
  version: string;
  cpuCores: number;
  cpuPct: number;
  memTotalMb: number;
  memUsedMb: number;
  gpuPct: number | null;
  sessions: number;
  maxSessions: number;
}

export interface Zone {
  id: string;
  name: string;
  region: string;
  agents: number;
  sessions: number;
  status: 'healthy' | 'degraded' | 'offline';
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string;
  status: 'ACTIVE' | 'DISABLED' | 'INVITED' | 'LOCKED';
  groups: string[];
  twoFactor: boolean;
  lastLoginAt: string | null;
}

export interface CreateUserInput {
  email: string;
  username?: string;
  displayName?: string;
  password?: string;
  isSystemAdmin?: boolean;
  locale?: string;
}

export interface CreateWorkspaceInput {
  friendlyName: string;
  name?: string;
  description?: string;
  iconUrl?: string;
  type?: WorkspaceType;
  category?: string;
  dockerImage?: string;
  serverId?: string;
  zoneId?: string;
  cores?: number;
  memMb?: number;
  gpu?: number;
  enabled?: boolean;
}

export interface ActivityItem {
  id: string;
  kind: 'session' | 'auth' | 'admin' | 'agent' | 'alert';
  actor: string;
  message: string;
  at: string;
}

/** An installed image with its linked workspaces' resource limits (manageable). */
export interface ManagedImageWorkspace {
  id: string;
  friendlyName: string;
  cores: number | null;
  memMb: number | null;
  gpu: number;
}
export interface ManagedImage {
  id: string;
  name: string;
  friendlyName: string;
  dockerImage: string;
  protocol: string;
  digest: string | null;
  pullPolicy: 'ALWAYS' | 'IF_NOT_PRESENT' | 'NEVER';
  createdAt: string;
  workspaces: ManagedImageWorkspace[];
}

export interface ImageRow {
  id: string;
  fullImage: string;
  registry: string;
  name: string;
  tag: string;
  workspaces: string[];
  sizeMb: number;
  pulledAt: string;
  status: 'available' | 'pulling' | 'error';
}

export interface RecordingRow {
  id: string;
  sessionId: string;
  workspaceName: string;
  user: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH';
  status: 'RECORDING' | 'FINALIZING' | 'AVAILABLE' | 'FAILED';
  sizeMb: number;
  durationSec: number;
  startedAt: string;
}

export type SessionEndReason = 'USER' | 'TIMEOUT' | 'ADMIN' | 'ERROR';

export interface HistoryRow {
  id: string;
  user: { id: string; name: string; email: string };
  workspaceName: string;
  zone: string;
  agent: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  endReason: SessionEndReason;
  connectionType: string;
}

// ── Bug reporting + fix memory ────────────────────────────────────────────────

export type BugSource = 'USER' | 'AUTOMATIC';
export type BugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BugStatus =
  | 'OPEN'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'WONT_FIX'
  | 'DUPLICATE';

export interface BugFixRow {
  id: string;
  title: string;
  rootCause: string;
  resolution: string;
  prevention: string | null;
  filesTouched: string[];
  commitRef: string | null;
  authoredBy: 'AI' | 'HUMAN';
  authorName: string | null;
  tags: string[];
  reusedCount: number;
  createdAt: string;
  /** How many reports reference this fix (live API only). */
  reportCount?: number;
}

export interface BugReportRow {
  id: string;
  source: BugSource;
  status: BugStatus;
  severity: BugSeverity;
  title: string;
  description: string;
  errorCode: string | null;
  errorName: string | null;
  stackTrace: string | null;
  component: string | null;
  route: string | null;
  httpStatus: number | null;
  reporterEmail: string | null;
  occurrences: number;
  createdAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  fix: BugFixRow | null;
  /** A prior fix matched by fingerprint — the "we've solved this before" signal. */
  knownFix?: BugFixRow | null;
}

export interface BugStats {
  open: number;
  critical: number;
  automatic: number;
  resolved: number;
  knowledgeEntries: number;
}

/** Payload a user submits from the report-a-bug dialog. */
export interface BugReportInput {
  title: string;
  description: string;
  severity: BugSeverity;
  route?: string;
}

/** Payload an operator/AI submits when resolving a bug into the fix memory. */
export interface BugResolveInput {
  rootCause: string;
  resolution: string;
  prevention?: string;
  filesTouched?: string[];
  commitRef?: string;
  authoredBy?: 'AI' | 'HUMAN';
  authorName?: string;
  tags?: string[];
}

/** Shape captured automatically by the web error boundary / window handlers. */
export interface ClientErrorInput {
  errorName?: string;
  message: string;
  stack?: string;
  route?: string;
  component?: string;
  severity?: BugSeverity;
}

export interface KpiSeriesPoint {
  t: string;
  value: number;
}

// ── Feedback / bug reports (and the shared triage "memory") ──────────────────

export type FeedbackKind = 'BUG' | 'FEEDBACK';
export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'WONTFIX';

/** One entry in the collaboration thread admins/agents use to triage an item. */
export interface FeedbackNote {
  author: string;
  body: string;
  at: string;
}

export interface FeedbackItem {
  id: string;
  userId: string | null;
  kind: FeedbackKind;
  message: string;
  pageUrl: string | null;
  /** Optional screenshot captured with a bug report (data URL). */
  screenshot: string | null;
  status: FeedbackStatus;
  notes: FeedbackNote[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedbackInput {
  kind: FeedbackKind;
  message: string;
  pageUrl?: string;
  screenshot?: string;
}

export interface UpdateFeedbackInput {
  status?: FeedbackStatus;
  note?: string;
}

export interface DashboardSnapshot {
  kpis: {
    activeSessions: { value: number; deltaPct: number; series: number[] };
    onlineAgents: { value: number; total: number; series: number[] };
    cpuUtilization: { value: number; deltaPct: number; series: number[] };
    memUtilization: { value: number; deltaPct: number; series: number[] };
  };
  sessionsOverTime: KpiSeriesPoint[];
  topWorkspaces: { name: string; sessions: number; icon?: string }[];
  utilization: { cpu: number; mem: number; gpu: number; storage: number };
}
