import type {
  Agent,
  DashboardSnapshot,
  SessionRow,
  UserRow,
  Workspace,
  Zone,
} from '@/lib/types';
import type { ApiAgent, ApiSession, ApiUser, ApiWorkspace, ApiZone } from './endpoints';

const flat = (value: number, len = 24): number[] => Array.from({ length: len }, () => Math.round(value));

const PROTOCOL_LABEL: Record<string, string> = {
  KASMVNC: 'KasmVNC',
  GUAC_RDP: 'RDP',
  GUAC_VNC: 'VNC',
  GUAC_SSH: 'SSH',
  RDP: 'RDP',
  VNC: 'VNC',
  SSH: 'SSH',
};

export interface SessionLookups {
  users: Map<string, ApiUser>;
  zones: Map<string, ApiZone>;
  agents: Map<string, ApiAgent>;
  workspaces: Map<string, ApiWorkspace>;
}

export function mapWorkspace(w: ApiWorkspace, activeSessions = 0): Workspace {
  // Protocol comes from the backing image (containers) or the bound server
  // (RDP/VNC/SSH machines, incl. Windows desktops).
  const serverProto = (w.server?.connectionType ?? '').toUpperCase();
  const protocol = (w.image?.protocol ??
    (serverProto === 'RDP' || serverProto === 'VNC' || serverProto === 'SSH' ? serverProto : 'KASMVNC')) as
    Workspace['protocol'];
  return {
    id: w.id,
    name: w.name,
    friendlyName: w.friendlyName,
    description: w.description ?? '',
    category: w.categories[0] ?? 'Other',
    iconUrl: w.iconUrl ?? undefined,
    cores: w.coresLimit ?? 0,
    memMb: w.memLimitMb ?? 0,
    gpu: w.gpuCount,
    enabled: w.enabled,
    dockerImage: w.image?.dockerImage ?? w.server?.hostname ?? '',
    protocol,
    type: w.type ?? 'CONTAINER',
    serverId: w.serverId ?? undefined,
    serverName: w.server?.hostname,
    zoneName: w.zone?.name ?? w.server?.zone?.name,
    activeSessions,
    assignedGroupIds: (w.groups ?? []).map((g) => g.id),
    assignedUserIds: (w.assignedUsers ?? []).map((a) => a.userId),
  };
}

export function mapAgent(a: ApiAgent): Agent {
  return {
    id: a.id,
    hostname: a.hostname,
    zone: a.zone?.name ?? a.zoneId,
    status: a.status,
    version: a.version ?? '—',
    cpuCores: a.cpuCores,
    cpuPct: Math.round(a.loadPercent),
    memTotalMb: a.memTotalMb,
    memUsedMb: Math.max(0, a.memTotalMb - a.memFreeMb),
    gpuPct: null,
    sessions: a.currentSessions,
    maxSessions: a.maxSessions,
  };
}

export function mapUser(u: ApiUser): UserRow {
  return {
    id: u.id,
    name: u.displayName ?? u.username,
    email: u.email,
    username: u.username,
    status: u.status,
    groups: (u.groups ?? []).map((g) => g.group.name),
    twoFactor: false,
    lastLoginAt: u.lastLoginAt,
  };
}

export function mapSession(s: ApiSession, lk: SessionLookups): SessionRow {
  const user = lk.users.get(s.userId);
  const agent = s.agentId ? lk.agents.get(s.agentId) : undefined;
  const workspace = lk.workspaces.get(s.workspaceId);
  const startedMs = s.startedAt ? Date.parse(s.startedAt) : Date.parse(s.createdAt);
  const uptimeSec = Number.isFinite(startedMs) ? Math.max(0, Math.round((Date.now() - startedMs) / 1000)) : 0;
  return {
    id: s.id,
    kasmId: s.kasmId,
    user: {
      id: s.userId,
      name: user?.displayName ?? user?.username ?? s.userId,
      email: user?.email ?? '',
    },
    workspaceName: s.workspaceName ?? workspace?.friendlyName ?? 'Workspace',
    zone: lk.zones.get(s.zoneId)?.name ?? s.zoneId,
    agent: agent?.hostname ?? '—',
    status: s.status,
    cpuPct: Math.round(s.resources?.cpuPct ?? 0),
    memMb: Math.round(s.resources?.memMb ?? 0),
    memLimitMb: workspace?.memLimitMb ?? 0,
    uptimeSec,
    createdAt: s.createdAt,
    connectionType: PROTOCOL_LABEL[s.connectionType] ?? s.connectionType,
    connectionUrl: s.connectionUrl ?? undefined,
  };
}

/** Derives the dashboard snapshot from live sessions + agents (no API endpoint). */
export function deriveDashboard(sessions: SessionRow[], agents: Agent[]): DashboardSnapshot {
  const running = sessions.filter((s) => s.status === 'RUNNING' || s.status === 'DEGRADED').length;
  const online = agents.filter((a) => a.status === 'ONLINE');
  const cpu = online.length ? Math.round(online.reduce((s, a) => s + a.cpuPct, 0) / online.length) : 0;
  const mem = online.length
    ? Math.round((online.reduce((s, a) => s + a.memUsedMb / Math.max(1, a.memTotalMb), 0) / online.length) * 100)
    : 0;

  const byWorkspace = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === 'RUNNING' || s.status === 'DEGRADED') {
      byWorkspace.set(s.workspaceName, (byWorkspace.get(s.workspaceName) ?? 0) + 1);
    }
  }
  const topWorkspaces = [...byWorkspace.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, sessions: count }));

  return {
    kpis: {
      activeSessions: { value: running, deltaPct: 0, series: flat(running) },
      onlineAgents: { value: online.length, total: agents.length, series: flat(online.length) },
      cpuUtilization: { value: cpu, deltaPct: 0, series: flat(cpu) },
      memUtilization: { value: mem, deltaPct: 0, series: flat(mem) },
    },
    sessionsOverTime: flat(running).map((value, i) => ({ t: `${i}`, value })),
    topWorkspaces,
    utilization: { cpu, mem, gpu: 0, storage: 0 },
  };
}

export function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}
