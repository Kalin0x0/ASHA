import { buildInitialData, type MockData } from '@/lib/mock/data';
import type { DashboardSnapshot, SessionRow, SessionStatus } from '@/lib/types';
import { clamp } from '@/lib/utils';

const SERIES_LEN = 24;

type SeriesKey = 'activeSessions' | 'cpu' | 'mem' | 'agents';

function seedSeries(base: number, spread: number): number[] {
  return Array.from({ length: SERIES_LEN }, (_, i) =>
    Math.max(0, Math.round(base + Math.sin(i / 2.2) * spread + (i % 3) * (spread / 4))),
  );
}

class MockStore {
  private data: MockData = buildInitialData();
  private listeners = new Set<() => void>();
  private version = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  private series = {
    activeSessions: seedSeries(22, 6),
    cpu: seedSeries(44, 14),
    mem: seedSeries(51, 10),
    agents: seedSeries(5, 1),
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;
  getData = (): MockData => this.data;

  private emit() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }

  startTicker() {
    if (this.timer || typeof window === 'undefined') return;
    this.timer = setInterval(() => this.tick(), 2200);
  }

  stopTicker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private jitter(value: number, amount: number, min = 0, max = 100): number {
    return clamp(value + (Math.random() - 0.5) * amount, min, max);
  }

  private tick() {
    for (const agent of this.data.agents) {
      if (agent.status === 'ONLINE') {
        agent.cpuPct = this.jitter(agent.cpuPct, 9, 4, 96);
        agent.memUsedMb = clamp(
          agent.memUsedMb + (Math.random() - 0.5) * agent.memTotalMb * 0.04,
          agent.memTotalMb * 0.1,
          agent.memTotalMb * 0.92,
        );
        if (agent.gpuPct !== null) agent.gpuPct = this.jitter(agent.gpuPct, 12, 0, 99);
      }
    }

    for (const s of this.data.sessions) {
      if (s.status === 'RUNNING' || s.status === 'DEGRADED') {
        s.cpuPct = this.jitter(s.cpuPct, 11, 1, 98);
        s.memMb = clamp(s.memMb + (Math.random() - 0.5) * s.memLimitMb * 0.05, s.memLimitMb * 0.1, s.memLimitMb * 0.95);
        s.uptimeSec += 2;
      } else if (s.status === 'PROVISIONING') {
        if (Math.random() > 0.6) {
          s.status = 'RUNNING';
          s.cpuPct = 18;
          s.memMb = s.memLimitMb * 0.3;
        }
      } else if (s.status === 'SCHEDULED') {
        if (Math.random() > 0.7) s.status = 'PROVISIONING';
      }
    }

    const running = this.data.sessions.filter((s) => s.status === 'RUNNING' || s.status === 'DEGRADED').length;
    const online = this.data.agents.filter((a) => a.status === 'ONLINE').length;
    this.pushSeries('activeSessions', running);
    this.pushSeries('agents', online);
    this.pushSeries('cpu', this.avgCpu());
    this.pushSeries('mem', this.avgMem());

    this.emit();
  }

  private pushSeries(key: SeriesKey, value: number) {
    this.series[key].push(Math.round(value));
    if (this.series[key].length > SERIES_LEN) this.series[key].shift();
  }

  private avgCpu(): number {
    const online = this.data.agents.filter((a) => a.status === 'ONLINE');
    if (!online.length) return 0;
    return online.reduce((sum, a) => sum + a.cpuPct, 0) / online.length;
  }

  private avgMem(): number {
    const online = this.data.agents.filter((a) => a.status === 'ONLINE');
    if (!online.length) return 0;
    return (online.reduce((sum, a) => sum + a.memUsedMb / a.memTotalMb, 0) / online.length) * 100;
  }

  terminateSession(id: string) {
    const target = this.data.sessions.find((s) => s.id === id);
    if (target) {
      const agent = this.data.agents.find((a) => a.hostname === target.agent);
      if (agent && agent.sessions > 0) agent.sessions -= 1;
    }
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    this.emit();
  }

  launchSession(workspaceId: string): SessionRow | null {
    const ws = this.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return null;
    const agent = this.data.agents.find((a) => a.status === 'ONLINE') ?? this.data.agents[0]!;
    const session: SessionRow = {
      id: `sess-${Math.floor(Math.random() * 1e6)}`,
      kasmId: Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      user: { id: 'user-1', name: 'Shahin Naiemi', email: 'shahin.naiemi@chista.local' },
      workspaceName: ws.friendlyName,
      zone: agent.zone,
      agent: agent.hostname,
      status: 'PROVISIONING' as SessionStatus,
      cpuPct: 0,
      memMb: 0,
      memLimitMb: ws.memMb,
      uptimeSec: 0,
      createdAt: new Date().toISOString(),
      connectionType: ws.protocol === 'KASMVNC' ? 'KasmVNC' : ws.protocol,
    };
    this.data.sessions = [session, ...this.data.sessions];
    ws.activeSessions += 1;
    this.emit();
    return session;
  }

  getDashboard(): DashboardSnapshot {
    const running = this.data.sessions.filter((s) => s.status === 'RUNNING' || s.status === 'DEGRADED').length;
    const online = this.data.agents.filter((a) => a.status === 'ONLINE').length;
    const cpu = this.avgCpu();
    const mem = this.avgMem();
    const gpuAgents = this.data.agents.filter((a) => a.gpuPct !== null && a.status === 'ONLINE');
    const gpu = gpuAgents.length ? gpuAgents.reduce((s, a) => s + (a.gpuPct ?? 0), 0) / gpuAgents.length : 0;

    const topWorkspaces = [...this.data.workspaces]
      .filter((w) => w.activeSessions > 0)
      .sort((a, b) => b.activeSessions - a.activeSessions)
      .slice(0, 5)
      .map((w) => ({ name: w.friendlyName, sessions: w.activeSessions }));

    return {
      kpis: {
        activeSessions: { value: running, deltaPct: 12.4, series: [...this.series.activeSessions] },
        onlineAgents: { value: online, total: this.data.agents.length, series: [...this.series.agents] },
        cpuUtilization: { value: Math.round(cpu), deltaPct: -3.1, series: [...this.series.cpu] },
        memUtilization: { value: Math.round(mem), deltaPct: 5.8, series: [...this.series.mem] },
      },
      sessionsOverTime: this.series.activeSessions.map((value, i) => ({ t: `${i}`, value })),
      topWorkspaces,
      utilization: { cpu: Math.round(cpu), mem: Math.round(mem), gpu: Math.round(gpu), storage: 38 },
    };
  }
}

export const store = new MockStore();
