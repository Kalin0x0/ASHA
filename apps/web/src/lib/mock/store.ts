import type { ApiMarketplaceEntry, ApiRegistry } from '@/lib/api/endpoints';
import { buildInitialData, type MockData } from '@/lib/mock/data';
import { resolveStreamUrl } from '@/lib/stream';
import type {
  BugReportInput,
  BugReportRow,
  BugResolveInput,
  ClientErrorInput,
  CreateFeedbackInput,
  CreateUserInput,
  CreateWorkspaceInput,
  DashboardSnapshot,
  FeedbackItem,
  SessionRow,
  SessionStatus,
  UpdateFeedbackInput,
  UpdateWorkspaceInput,
  UserRow,
  Workspace,
} from '@/lib/types';
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

  constructor() {
    // Seeded sessions that are already live get a connection URL so opening one
    // straight from the sessions table embeds the stream just like a fresh launch.
    for (const s of this.data.sessions) {
      if ((s.status === 'RUNNING' || s.status === 'DEGRADED') && !s.connectionUrl) {
        s.connectionUrl = resolveStreamUrl(s.kasmId);
      }
    }
  }

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
      } else {
        // Deterministically walk a launching session through every step
        // (REQUESTED → SCHEDULED → PROVISIONING → RUNNING) one stage per tick,
        // so the connecting view always completes instead of stalling.
        const next: Partial<Record<SessionStatus, SessionStatus>> = {
          REQUESTED: 'SCHEDULED',
          SCHEDULED: 'PROVISIONING',
          PROVISIONING: 'RUNNING',
        };
        const advanced = next[s.status];
        if (advanced) {
          s.status = advanced;
          if (advanced === 'RUNNING') {
            s.cpuPct = 18;
            s.memMb = s.memLimitMb * 0.3;
            s.connectionUrl = resolveStreamUrl(s.kasmId);
          }
        }
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

  pauseSession(id: string) {
    const s = this.data.sessions.find((x) => x.id === id);
    if (s && (s.status === 'RUNNING' || s.status === 'DEGRADED')) {
      s.status = 'PAUSED';
      this.emit();
    }
  }

  resumeSession(id: string) {
    const s = this.data.sessions.find((x) => x.id === id);
    if (s && s.status === 'PAUSED') {
      s.status = 'RUNNING';
      this.emit();
    }
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
      user: { id: 'user-1', name: 'Shahin Naiemi', email: 'shahin.naiemi@asha.local' },
      workspaceName: ws.friendlyName,
      zone: agent.zone,
      agent: agent.hostname,
      // Start at the first lifecycle step; the ticker walks it through
      // SCHEDULED → PROVISIONING → RUNNING so every step is shown completing.
      status: 'REQUESTED',
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

  /**
   * Create a user in the in-memory store (mock mode). Mirrors the API's
   * validation: email is required and email/username must be unique. Throws an
   * Error whose message the dialog surfaces to the operator.
   */
  createUser(input: CreateUserInput): UserRow {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error('Email is required');
    const username = (input.username?.trim() || email.split('@')[0] || email).toLowerCase();
    const clash = this.data.users.some(
      (u) => u.email.toLowerCase() === email || u.username.toLowerCase() === username,
    );
    if (clash) throw new Error('A user with this email or username already exists');
    const user: UserRow = {
      id: `user-${Math.floor(Math.random() * 1e6)}`,
      name: input.displayName?.trim() || username,
      email,
      username,
      status: 'ACTIVE',
      isSystemAdmin: input.isSystemAdmin ?? false,
      groups: input.isSystemAdmin ? ['Administrators', 'All Users'] : ['All Users'],
      twoFactor: false,
      lastLoginAt: null,
      deactivatesAt: input.deactivatesAt ?? null,
    };
    this.data.users = [user, ...this.data.users];
    this.emit();
    return user;
  }

  /**
   * Create a workspace in the in-memory store (mock mode). Mirrors the API:
   * a friendly name is required and the derived slug must be unique. Throws an
   * Error whose message the dialog surfaces.
   */
  createWorkspace(input: CreateWorkspaceInput): Workspace {
    const friendlyName = input.friendlyName.trim();
    if (!friendlyName) throw new Error('A workspace name is required');
    const slug =
      (input.name?.trim() ||
        friendlyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')) || 'workspace';
    if (this.data.workspaces.some((w) => w.name === slug)) {
      throw new Error('A workspace with this name already exists');
    }

    const type = input.type ?? 'CONTAINER';
    const server = input.serverId ? this.data.servers.find((s) => s.id === input.serverId) : undefined;
    if (type === 'SERVER' && !server) {
      throw new Error('Choose a server for a server-backed workspace');
    }
    const zone = input.zoneId ? this.data.zones.find((z) => z.id === input.zoneId) : undefined;

    const ws: Workspace = {
      id: `ws-${Math.floor(Math.random() * 1e6)}`,
      name: slug,
      friendlyName,
      description:
        input.description?.trim() ||
        (server ? `${friendlyName} over ${server.connectionType}.` : `${friendlyName} streamed in an isolated container.`),
      iconUrl: input.iconUrl?.trim() || undefined,
      category: input.category?.trim() || (type === 'SERVER' ? 'Servers' : 'Other'),
      cores: input.cores ?? 2,
      memMb: input.memMb ?? 2768,
      gpu: input.gpu ?? 0,
      enabled: input.enabled ?? true,
      dockerImage: server ? '' : input.dockerImage?.trim() || 'kasmweb/core:1.16.0',
      protocol: server ? server.connectionType : 'KASMVNC',
      type,
      serverName: server?.hostname,
      zoneName: zone?.name ?? server?.zoneName,
      activeSessions: 0,
    };
    this.data.workspaces = [ws, ...this.data.workspaces];
    this.emit();
    return ws;
  }

  updateWorkspace(id: string, patch: UpdateWorkspaceInput): Workspace {
    const ws = this.data.workspaces.find((w) => w.id === id);
    if (!ws) throw new Error('Workspace not found');
    if (patch.friendlyName !== undefined) ws.friendlyName = patch.friendlyName.trim() || ws.friendlyName;
    if (patch.description !== undefined) ws.description = patch.description;
    if (patch.category !== undefined) ws.category = patch.category.trim() || ws.category;
    if (patch.iconUrl !== undefined) ws.iconUrl = patch.iconUrl.trim() || undefined;
    if (patch.cores !== undefined) ws.cores = patch.cores;
    if (patch.memMb !== undefined) ws.memMb = patch.memMb;
    if (patch.gpu !== undefined) ws.gpu = patch.gpu;
    if (patch.enabled !== undefined) ws.enabled = patch.enabled;
    this.emit();
    return ws;
  }

  deleteWorkspace(id: string): void {
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id);
    this.emit();
  }

  // ── Feedback / bug reports + the shared triage memory ───────────────────────

  getFeedback(status?: string): FeedbackItem[] {
    const all = this.data.feedback;
    return status ? all.filter((f) => f.status === status) : all;
  }

  createFeedback(input: CreateFeedbackInput): FeedbackItem {
    const message = input.message.trim();
    if (!message) throw new Error('A message is required');
    const item: FeedbackItem = {
      id: `fb-${Math.floor(Math.random() * 1e6)}`,
      userId: 'user-1',
      kind: input.kind,
      message,
      pageUrl: input.pageUrl ?? null,
      screenshot: input.screenshot ?? null,
      status: 'OPEN',
      notes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.feedback = [item, ...this.data.feedback];
    this.emit();
    return item;
  }

  deleteImage(id: string): void {
    this.data.images = this.data.images.filter((i) => i.id !== id);
    this.emit();
  }

  // ── Registry sources + image marketplace ────────────────────────────────────

  getRegistries(): ApiRegistry[] {
    return this.data.registries;
  }

  getMarketplace(): ApiMarketplaceEntry[] {
    return this.data.marketplace;
  }

  addRegistry(input: { name: string; url: string }): ApiRegistry {
    const name = input.name.trim();
    const url = input.url.trim();
    if (!name || !url) throw new Error('A name and URL are required');
    if (this.data.registries.some((r) => r.url === url)) {
      throw new Error('A registry with this URL already exists');
    }
    const reg: ApiRegistry = {
      id: `reg-${Math.floor(Math.random() * 1e6)}`,
      name,
      url,
      type: 'THIRD_PARTY',
      enabled: true,
      lastSyncedAt: null,
      _count: { entries: 0 },
    };
    this.data.registries = [...this.data.registries, reg];
    this.emit();
    return reg;
  }

  deleteRegistry(id: string): void {
    this.data.registries = this.data.registries.filter((r) => r.id !== id);
    // Drop the marketplace entries contributed by that source.
    const name = this.data.registries.find((r) => r.id === id)?.name;
    if (name) this.data.marketplace = this.data.marketplace.filter((m) => m.registry?.name !== name);
    this.emit();
  }

  syncRegistry(id: string): { upserted: number } {
    const reg = this.data.registries.find((r) => r.id === id);
    if (!reg) throw new Error('Registry not found');
    reg.lastSyncedAt = new Date().toISOString();
    const upserted = reg._count?.entries ?? 0;
    this.emit();
    return { upserted };
  }

  installEntry(id: string): void {
    const entry = this.data.marketplace.find((m) => m.id === id);
    if (entry) {
      entry.installed = true;
      this.emit();
    }
  }

  updateFeedback(id: string, patch: UpdateFeedbackInput): FeedbackItem {
    const item = this.data.feedback.find((f) => f.id === id);
    if (!item) throw new Error('Feedback not found');
    if (patch.note?.trim()) {
      item.notes = [...item.notes, { author: 'user-1', body: patch.note.trim(), at: new Date().toISOString() }];
    }
    if (patch.status) item.status = patch.status;
    item.updatedAt = new Date().toISOString();
    this.emit();
    return item;
  }

  // ── Bug reports + fix memory (mock) ────────────────────────────────────────

  private shortCode(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return `ERR-${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 8)}`;
  }

  submitBug(input: BugReportInput & { reporterEmail?: string }): BugReportRow {
    const now = new Date().toISOString();
    const report: BugReportRow = {
      id: `bug-${Math.floor(Math.random() * 1e6)}`,
      source: 'USER',
      status: 'OPEN',
      severity: input.severity,
      title: input.title,
      description: input.description,
      errorCode: this.shortCode(`user|${input.title}`),
      errorName: null,
      stackTrace: null,
      component: 'web',
      route: input.route ?? null,
      httpStatus: null,
      reporterEmail: input.reporterEmail ?? 'you@chista.local',
      occurrences: 1,
      createdAt: now,
      lastSeenAt: now,
      resolvedAt: null,
      fix: null,
    };
    this.data.bugReports = [report, ...this.data.bugReports];
    this.emit();
    return report;
  }

  /** Auto-capture from the web error boundary / window handlers (mock mode). */
  ingestBug(input: ClientErrorInput): BugReportRow {
    const code = this.shortCode(`${input.component ?? 'web'}|${input.errorName ?? ''}|${input.message}`);
    const existing = this.data.bugReports.find(
      (b) => b.errorCode === code && b.status !== 'RESOLVED' && b.status !== 'CLOSED',
    );
    if (existing) {
      existing.occurrences += 1;
      existing.lastSeenAt = new Date().toISOString();
      this.emit();
      return existing;
    }
    const now = new Date().toISOString();
    const report: BugReportRow = {
      id: `bug-${Math.floor(Math.random() * 1e6)}`,
      source: 'AUTOMATIC',
      status: 'OPEN',
      severity: input.severity ?? 'HIGH',
      title: input.errorName ? `${input.errorName}: ${input.message}` : input.message,
      description: input.message,
      errorName: input.errorName ?? null,
      stackTrace: input.stack ?? null,
      errorCode: code,
      component: input.component ?? 'web',
      route: input.route ?? null,
      httpStatus: null,
      reporterEmail: null,
      occurrences: 1,
      createdAt: now,
      lastSeenAt: now,
      resolvedAt: null,
      fix: null,
    };
    this.data.bugReports = [report, ...this.data.bugReports];
    this.emit();
    return report;
  }

  updateBug(id: string, patch: { status?: BugReportRow['status']; severity?: BugReportRow['severity'] }) {
    const b = this.data.bugReports.find((x) => x.id === id);
    if (!b) return;
    if (patch.status) {
      b.status = patch.status;
      if (patch.status === 'RESOLVED' && !b.resolvedAt) b.resolvedAt = new Date().toISOString();
    }
    if (patch.severity) b.severity = patch.severity;
    this.emit();
  }

  resolveBug(id: string, input: BugResolveInput) {
    const b = this.data.bugReports.find((x) => x.id === id);
    if (!b) return;
    const fix = {
      id: `fix-${Math.floor(Math.random() * 1e6)}`,
      title: b.title,
      rootCause: input.rootCause,
      resolution: input.resolution,
      prevention: input.prevention ?? null,
      filesTouched: input.filesTouched ?? [],
      commitRef: input.commitRef ?? null,
      authoredBy: input.authoredBy ?? 'HUMAN',
      authorName: input.authorName ?? 'You',
      tags: input.tags ?? [],
      reusedCount: 0,
      createdAt: new Date().toISOString(),
      reportCount: 1,
    };
    this.data.bugFixes = [fix, ...this.data.bugFixes];
    b.status = 'RESOLVED';
    b.resolvedAt = new Date().toISOString();
    b.fix = fix;
    this.emit();
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
