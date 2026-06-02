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

export interface ActivityItem {
  id: string;
  kind: 'session' | 'auth' | 'admin' | 'agent' | 'alert';
  actor: string;
  message: string;
  at: string;
}

export interface KpiSeriesPoint {
  t: string;
  value: number;
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
