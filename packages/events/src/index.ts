/**
 * Typed Redis pub/sub channels and message shapes shared by the manager, the
 * agent, and the connection proxy. Keeping the wire format here prevents drift
 * between the producers and consumers of every cross-process message.
 */

export const RedisChannels = {
  /** Manager → agents in a zone: provision a session. */
  provision: (zone: string) => `chista:zone:${zone}:provision`,
  /** Manager → agents in a zone: destroy a session. */
  destroy: (zone: string) => `chista:zone:${zone}:destroy`,
  /** Agent → manager: lifecycle/status updates. */
  agentStatus: 'chista:agent:status',
  /** Agent → manager: batched resource stats. */
  agentStats: 'chista:agent:stats',
  /** Manager fan-out to an org's connected dashboards. */
  orgSessions: (orgId: string) => `chista:org:${orgId}:sessions`,
  /** Session-share chat/control fan-out. */
  share: (shareId: string) => `chista:share:${shareId}`,
} as const;

export interface RunConfig {
  dockerImage: string;
  env: Record<string, string>;
  ports: number[];
  shmSize?: string;
  cores?: number;
  memLimitMb?: number;
  gpuCount?: number;
  volumes?: Array<{ source: string; target: string; readOnly?: boolean }>;
}

export interface ProvisionCommand {
  sessionId: string;
  kasmId: string;
  orgId: string;
  workspaceId: string;
  zone: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH';
  runConfig: RunConfig;
}

export interface DestroyCommand {
  sessionId: string;
  containerId?: string;
  reason?: string;
  preserveVolumes?: boolean;
}

export type SessionLifecycleStatus =
  | 'PROVISIONING'
  | 'RUNNING'
  | 'DEGRADED'
  | 'DESTROYED'
  | 'ERROR';

export interface SessionStatusUpdate {
  sessionId: string;
  status: SessionLifecycleStatus;
  containerId?: string;
  internalHost?: string;
  host?: string;
  port?: number;
  traefikRouterName?: string;
  error?: string;
}

export interface SessionStatSample {
  sessionId: string;
  cpuPct: number;
  memMb: number;
  netRxKb?: number;
  netTxKb?: number;
}

export interface AgentHeartbeat {
  agentId: string;
  cpuCores: number;
  memTotalMb: number;
  memFreeMb: number;
  loadPercent: number;
  currentSessions: number;
  version: string;
}

/** Realtime events pushed to dashboards over the WebSocket gateway. */
export type WsServerEvent =
  | { type: 'session.status'; payload: SessionStatusUpdate }
  | { type: 'session.stats'; payload: SessionStatSample }
  | { type: 'session.ready'; payload: { sessionId: string; connectionUrl: string } }
  | { type: 'agent.health'; payload: AgentHeartbeat & { status: string } }
  | { type: 'alert.new'; payload: { level: 'info' | 'warn' | 'error'; message: string } };
