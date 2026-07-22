import type {
  Agent,
  ActivityItem,
  BugFixRow,
  BugReportRow,
  FeedbackItem,
  HistoryRow,
  ImageRow,
  RecordingRow,
  ServerOption,
  SessionEndReason,
  SessionRow,
  SessionStatus,
  UserRow,
  Workspace,
  Zone,
} from '@/lib/types';
import type { ApiMarketplaceEntry, ApiRegistry } from '@/lib/api/endpoints';
import { MARKETPLACE_SEED, REGISTRY_SEED, registryEntryCounts } from '@/lib/mock/marketplace';
import { mulberry32 } from '@/lib/utils';

const SEED = 20260601;

const WORKSPACE_DEFS: Array<Omit<Workspace, 'activeSessions'>> = [
  { id: 'ws-firefox', name: 'firefox', friendlyName: 'Firefox', description: 'Isolated Firefox browser session.', category: 'Browsers', cores: 2, memMb: 2768, gpu: 0, enabled: true, dockerImage: 'kasmweb/firefox:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-chrome', name: 'chrome', friendlyName: 'Google Chrome', description: 'Isolated Chrome browser session.', category: 'Browsers', cores: 2, memMb: 2768, gpu: 0, enabled: true, dockerImage: 'kasmweb/chrome:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-tor', name: 'tor', friendlyName: 'Tor Browser', description: 'Non-attributable research browsing.', category: 'Browsers', cores: 2, memMb: 2048, gpu: 0, enabled: true, dockerImage: 'kasmweb/tor-browser:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-desktop', name: 'ubuntu-desktop', friendlyName: 'Ubuntu Desktop', description: 'Full Ubuntu XFCE desktop environment.', category: 'Desktops', cores: 4, memMb: 4096, gpu: 0, enabled: true, dockerImage: 'kasmweb/desktop:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-vscode', name: 'vs-code', friendlyName: 'VS Code', description: 'Cloud development environment.', category: 'Development', cores: 4, memMb: 4096, gpu: 0, enabled: true, dockerImage: 'kasmweb/vs-code:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-terminal', name: 'terminal', friendlyName: 'Terminal', description: 'Hardened Ubuntu terminal.', category: 'Development', cores: 1, memMb: 1024, gpu: 0, enabled: true, dockerImage: 'kasmweb/terminal:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-kali', name: 'kali', friendlyName: 'Kali Linux', description: 'Security testing desktop.', category: 'Security', cores: 4, memMb: 6144, gpu: 0, enabled: true, dockerImage: 'kasmweb/kali-rolling-desktop:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-gimp', name: 'gimp', friendlyName: 'GIMP', description: 'Image editing workspace.', category: 'Creative', cores: 2, memMb: 3072, gpu: 0, enabled: true, dockerImage: 'kasmweb/gimp:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-blender', name: 'blender', friendlyName: 'Blender', description: 'GPU-accelerated 3D suite.', category: 'Creative', cores: 6, memMb: 8192, gpu: 1, enabled: true, dockerImage: 'kasmweb/blender:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-libreoffice', name: 'libreoffice', friendlyName: 'LibreOffice', description: 'Office productivity suite.', category: 'Productivity', cores: 2, memMb: 2768, gpu: 0, enabled: true, dockerImage: 'kasmweb/libre-office:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
  { id: 'ws-rdp', name: 'windows-11', friendlyName: 'Windows 11', description: 'Windows 11 desktop over RDP.', category: 'Desktops', cores: 4, memMb: 8192, gpu: 0, enabled: true, dockerImage: '', protocol: 'RDP', type: 'SERVER', serverId: 'srv-win11', serverName: 'win11-desktop-01', zoneName: 'homelab' },
  { id: 'ws-win10', name: 'windows-10', friendlyName: 'Windows 10', description: 'Windows 10 desktop over RDP.', category: 'Desktops', cores: 4, memMb: 6144, gpu: 0, enabled: true, dockerImage: '', protocol: 'RDP', type: 'SERVER', serverId: 'srv-win10', serverName: 'win10-desktop-01', zoneName: 'homelab' },
  { id: 'ws-winsrv', name: 'windows-server-2022', friendlyName: 'Windows Server 2022', description: 'Windows Server 2022 over RDP.', category: 'Servers', cores: 6, memMb: 8192, gpu: 0, enabled: true, dockerImage: '', protocol: 'RDP', type: 'SERVER', serverId: 'srv-winsrv', serverName: 'win-server-2022', zoneName: 'homelab' },
  { id: 'ws-postman', name: 'postman', friendlyName: 'Postman', description: 'API development workspace.', category: 'Development', cores: 2, memMb: 2048, gpu: 0, enabled: true, dockerImage: 'kasmweb/postman:1.16.0', protocol: 'KASMVNC', type: 'CONTAINER' },
];

// Registered RDP/VNC/SSH machines (incl. Windows desktops) — the pool the
// "New workspace" dialog's server picker draws from in mock mode.
const SERVER_DEFS: ServerOption[] = [
  { id: 'srv-win11', hostname: 'win11-desktop-01', connectionType: 'RDP', zoneName: 'homelab' },
  { id: 'srv-win10', hostname: 'win10-desktop-01', connectionType: 'RDP', zoneName: 'homelab' },
  { id: 'srv-winsrv', hostname: 'win-server-2022', connectionType: 'RDP', zoneName: 'homelab' },
  { id: 'srv-ubuntu', hostname: 'ubuntu-host-01', connectionType: 'VNC', zoneName: 'eu-frankfurt' },
  { id: 'srv-bastion', hostname: 'bastion-01', connectionType: 'SSH', zoneName: 'us-east' },
];

const ZONE_DEFS: Array<Pick<Zone, 'id' | 'name' | 'region'>> = [
  { id: 'zone-eu', name: 'eu-frankfurt', region: 'Europe' },
  { id: 'zone-us', name: 'us-east', region: 'North America' },
  { id: 'zone-lab', name: 'homelab', region: 'On-prem' },
];

const USER_NAMES = [
  'Kian Ardalan', 'Dariush Karimi', 'Leyla Hosseini', 'Arman Tehrani', 'Nadia Farahani',
  'Bijan Rostami', 'Sahar Ahmadi', 'Kaveh Mirzaei', 'Roya Esfahani', 'Omid Sadeghi',
  'Mina Yazdani', 'Farhad Ghorbani', 'Parisa Moradi', 'Reza Jafari',
];

const STATUS_POOL: SessionStatus[] = [
  'RUNNING', 'RUNNING', 'RUNNING', 'RUNNING', 'RUNNING', 'RUNNING',
  'PROVISIONING', 'PAUSED', 'DEGRADED', 'RUNNING', 'RUNNING', 'SCHEDULED',
];

export interface MockData {
  workspaces: Workspace[];
  zones: Zone[];
  servers: ServerOption[];
  agents: Agent[];
  sessions: SessionRow[];
  users: UserRow[];
  activity: ActivityItem[];
  history: HistoryRow[];
  images: ImageRow[];
  recordings: RecordingRow[];
  bugReports: BugReportRow[];
  bugFixes: BugFixRow[];
  feedback: FeedbackItem[];
  registries: ApiRegistry[];
  marketplace: ApiMarketplaceEntry[];
}

// Seed a few reports so the triage "memory" demonstrates the collaboration
// thread (users file reports; admins + automated agents reply and flip status).
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const FEEDBACK_SEED: FeedbackItem[] = [
  {
    id: 'fb-1',
    userId: 'user-3',
    kind: 'BUG',
    message: 'Copy/paste from my local machine into the Windows 11 desktop does not work.',
    pageUrl: '/connect/win11-desktop-01',
    screenshot: null,
    status: 'FIXED',
    notes: [
      { author: 'agent:triage', body: 'Reproduced — RDP clipboard channel was not bridged in the viewer.', at: hoursAgo(20) },
      { author: 'user-1', body: 'Clipboard bridge shipped; verified both directions.', at: hoursAgo(6) },
    ],
    createdAt: hoursAgo(26),
    updatedAt: hoursAgo(6),
  },
  {
    id: 'fb-2',
    userId: 'user-5',
    kind: 'FEEDBACK',
    message: 'Love the new desktop switcher. Could the thumbnails refresh a bit more often?',
    pageUrl: '/',
    screenshot: null,
    status: 'IN_PROGRESS',
    notes: [
      { author: 'agent:triage', body: 'Thumbnail cadence is configurable — evaluating a 15s default.', at: hoursAgo(3) },
    ],
    createdAt: hoursAgo(9),
    updatedAt: hoursAgo(3),
  },
  {
    id: 'fb-3',
    userId: 'user-8',
    kind: 'BUG',
    message: 'The wallpaper picker only shows solid colors, I expected a photo option.',
    pageUrl: '/',
    screenshot: null,
    status: 'OPEN',
    notes: [],
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
  },
];

// A documented fix already in the "memory" — mirrors the DB seed so the admin
// pages are populated in mock mode (the default for `pnpm dev` UI work).
const SEED_BUG_FIXES: BugFixRow[] = [
  {
    id: 'fix-1',
    title: 'Users/Groups page crashes on null groups relation',
    rootCause:
      'The users list endpoint did not include the groups relation in its Prisma select, so the web mapper called .map() on undefined and threw a TypeError.',
    resolution:
      'Added groups to the API SAFE_SELECT and guarded the mapper with (u.groups ?? []) so a missing relation degrades to an empty list instead of crashing.',
    prevention:
      'When a UI field maps over a relation, ensure the API selects that relation and the mapper null-guards it. Add a smoke test that renders the page in live mode.',
    filesTouched: ['apps/api/src/modules/users/users.service.ts', 'apps/web/src/lib/api/map.ts'],
    commitRef: null,
    authoredBy: 'AI',
    authorName: 'AI Assistant',
    tags: ['web', 'api', 'null-safety'],
    reusedCount: 1,
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    reportCount: 1,
  },
];

const SEED_BUG_REPORTS: BugReportRow[] = [
  {
    id: 'bug-1',
    source: 'USER',
    status: 'RESOLVED',
    severity: 'HIGH',
    title: 'Access → Users and Groups show an error message',
    description:
      'Opening Access → Users (or Groups) renders a red error instead of the table. Happens every time on a fresh login.',
    errorCode: 'ERR-USRGRP01',
    errorName: null,
    stackTrace: null,
    component: 'web',
    route: '/users',
    httpStatus: null,
    reporterEmail: 'admin@asha.local',
    occurrences: 3,
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    lastSeenAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    fix: SEED_BUG_FIXES[0]!,
  },
  {
    id: 'bug-2',
    source: 'AUTOMATIC',
    status: 'OPEN',
    severity: 'CRITICAL',
    title: 'TypeError: Cannot read properties of undefined (reading "id")',
    description: 'Unhandled exception captured automatically by the API exception filter.',
    errorCode: 'ERR-9F2C71A4',
    errorName: 'TypeError',
    stackTrace:
      'TypeError: Cannot read properties of undefined (reading "id")\n    at SessionsService.connection (sessions.service.ts:212:31)\n    at SessionsController.connection (sessions.controller.ts:88:24)',
    component: 'api',
    route: '/api/v1/sessions/abc123/connection',
    httpStatus: 500,
    reporterEmail: null,
    occurrences: 7,
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    lastSeenAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    resolvedAt: null,
    fix: null,
  },
  {
    id: 'bug-3',
    source: 'USER',
    status: 'OPEN',
    severity: 'MEDIUM',
    title: 'Language switcher does not persist after refresh on Safari',
    description:
      'Selecting Farsi switches the UI, but after a hard refresh it falls back to English. Only reproduces on Safari 17.',
    errorCode: 'ERR-LOCALE07',
    errorName: null,
    stackTrace: null,
    component: 'web',
    route: '/dashboard',
    httpStatus: null,
    reporterEmail: 'leyla.hosseini@asha.local',
    occurrences: 1,
    createdAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    lastSeenAt: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    resolvedAt: null,
    fix: null,
  },
];

export function buildInitialData(): MockData {
  const rng = mulberry32(SEED);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const between = (min: number, max: number) => min + rng() * (max - min);

  const users: UserRow[] = USER_NAMES.map((name, i) => {
    const username = name.toLowerCase().replace(/\s+/g, '.');
    return {
      id: `user-${i + 1}`,
      name,
      email: `${username}@asha.local`,
      username,
      status: i === 11 ? 'DISABLED' : i === 12 ? 'INVITED' : 'ACTIVE',
      isSystemAdmin: i < 2,
      groups: i < 2 ? ['Administrators', 'All Users'] : ['All Users'],
      twoFactor: rng() > 0.45,
      lastLoginAt: i === 12 ? null : `${Math.floor(between(1, 72))}h ago`,
      deactivatesAt: null,
    };
  });

  const agents: Agent[] = [];
  const agentLayout = [
    { zone: 'zone-eu', count: 2 },
    { zone: 'zone-us', count: 2 },
    { zone: 'zone-lab', count: 2 },
  ];
  let agentIdx = 0;
  for (const { zone, count } of agentLayout) {
    const zoneName = ZONE_DEFS.find((z) => z.id === zone)!.name;
    for (let i = 0; i < count; i++) {
      agentIdx++;
      const cpuCores = pick([8, 16, 16, 32]);
      const memTotalMb = cpuCores * 2048;
      const status: Agent['status'] =
        agentIdx === 6 ? 'DRAINING' : agentIdx === 5 ? 'UNHEALTHY' : 'ONLINE';
      const sessions = status === 'ONLINE' ? Math.floor(between(1, 7)) : status === 'DRAINING' ? 1 : 0;
      agents.push({
        id: `agent-${agentIdx}`,
        hostname: `${zoneName}-agent-${String(i + 1).padStart(2, '0')}`,
        zone: zoneName,
        status,
        version: '1.0.0',
        cpuCores,
        cpuPct: status === 'ONLINE' ? between(12, 68) : between(0, 8),
        memTotalMb,
        memUsedMb: memTotalMb * (status === 'ONLINE' ? between(0.2, 0.7) : 0.05),
        gpuPct: cpuCores >= 32 ? between(5, 80) : null,
        sessions,
        maxSessions: Math.floor(cpuCores / 2),
      });
    }
  }

  const onlineAgents = agents.filter((a) => a.status === 'ONLINE' || a.status === 'DRAINING');
  const sessions: SessionRow[] = [];
  const sessionCount = 24;
  for (let i = 0; i < sessionCount; i++) {
    const ws = pick(WORKSPACE_DEFS.filter((w) => w.enabled));
    // The first two sessions belong to the portal's current user (users[0]) so
    // the "My Sessions" resume strip is populated on first load — they map onto
    // the RUNNING slots at the head of STATUS_POOL.
    const user = i < 2 ? users[0]! : pick(users.filter((u) => u.status === 'ACTIVE'));
    const agent = pick(onlineAgents);
    const status = STATUS_POOL[i % STATUS_POOL.length]!;
    const memLimitMb = ws.memMb;
    const running = status === 'RUNNING' || status === 'DEGRADED';
    sessions.push({
      id: `sess-${i + 1}`,
      kasmId: Array.from({ length: 12 }, () => Math.floor(rng() * 16).toString(16)).join(''),
      user: { id: user.id, name: user.name, email: user.email },
      workspaceName: ws.friendlyName,
      zone: agent.zone,
      agent: agent.hostname,
      status,
      cpuPct: running ? between(3, 75) : 0,
      memMb: running ? memLimitMb * between(0.25, 0.85) : 0,
      memLimitMb,
      uptimeSec: running ? Math.floor(between(60, 14400)) : Math.floor(between(2, 40)),
      createdAt: new Date().toISOString(),
      connectionType: ws.protocol === 'KASMVNC' ? 'KasmVNC' : ws.protocol,
    });
  }

  const zones: Zone[] = ZONE_DEFS.map((z) => {
    const zAgents = agents.filter((a) => a.zone === z.name);
    const zSessions = sessions.filter((s) => s.zone === z.name).length;
    const hasUnhealthy = zAgents.some((a) => a.status === 'UNHEALTHY' || a.status === 'OFFLINE');
    return {
      ...z,
      agents: zAgents.length,
      sessions: zSessions,
      status: hasUnhealthy ? 'degraded' : 'healthy',
    };
  });

  const workspaces: Workspace[] = WORKSPACE_DEFS.map((w) => ({
    ...w,
    activeSessions: sessions.filter((s) => s.workspaceName === w.friendlyName).length,
  }));

  const activity: ActivityItem[] = [
    { id: 'a1', kind: 'session', actor: 'Leyla Hosseini', message: 'launched Ubuntu Desktop in eu-frankfurt', at: '2m ago' },
    { id: 'a2', kind: 'auth', actor: 'Arman Tehrani', message: 'signed in via OIDC', at: '5m ago' },
    { id: 'a3', kind: 'agent', actor: 'system', message: 'agent us-east-agent-02 reported unhealthy', at: '8m ago' },
    { id: 'a4', kind: 'admin', actor: 'Kian Ardalan', message: 'updated workspace "Kali Linux" resource limits', at: '14m ago' },
    { id: 'a5', kind: 'session', actor: 'Nadia Farahani', message: 'terminated a Firefox session', at: '18m ago' },
    { id: 'a6', kind: 'alert', actor: 'system', message: 'CPU on homelap-agent-01 exceeded 85%', at: '22m ago' },
    { id: 'a7', kind: 'admin', actor: 'Kian Ardalan', message: 'created API key "ci-pipeline"', at: '31m ago' },
    { id: 'a8', kind: 'session', actor: 'Kaveh Mirzaei', message: 'shared a VS Code session with 2 collaborators', at: '44m ago' },
    { id: 'a9', kind: 'auth', actor: 'Roya Esfahani', message: 'enrolled a WebAuthn security key', at: '1h ago' },
    { id: 'a10', kind: 'agent', actor: 'system', message: 'agent homelab-agent-02 entered draining state', at: '1h ago' },
  ];

  // ── Session history (terminated/destroyed sessions) ──────────────────────
  const END_REASONS: SessionEndReason[] = ['USER', 'USER', 'USER', 'TIMEOUT', 'ADMIN', 'ERROR'];
  const history: HistoryRow[] = Array.from({ length: 40 }, (_, i) => {
    const ws = pick(WORKSPACE_DEFS.filter((w) => w.enabled));
    const user = pick(users.filter((u) => u.status === 'ACTIVE'));
    const agent = pick(onlineAgents);
    const durationSec = Math.floor(between(120, 7200));
    const endedMs = Date.now() - Math.floor(between(0, 7 * 24 * 3600)) * 1000;
    const startedMs = endedMs - durationSec * 1000;
    return {
      id: `hist-${i + 1}`,
      user: { id: user.id, name: user.name, email: user.email },
      workspaceName: ws.friendlyName,
      zone: agent.zone,
      agent: agent.hostname,
      startedAt: new Date(startedMs).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      durationSec,
      endReason: pick(END_REASONS),
      connectionType: ws.protocol === 'KASMVNC' ? 'KasmVNC' : ws.protocol,
    };
  }).sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());

  // ── Container image registry (derived from workspace definitions) ────────
  const imageSizes: Record<string, number> = {
    firefox: 1380, chrome: 1520, 'tor-browser': 1240, desktop: 2100, 'vs-code': 2640,
    terminal: 890, 'kali-rolling-desktop': 4200, gimp: 1760, blender: 3100,
    'libre-office': 1450, postman: 1680,
  };
  const imageMap = new Map<string, ImageRow>();
  for (const ws of WORKSPACE_DEFS) {
    const img = ws.dockerImage;
    // Native protocols (RDP/SSH to external hosts) have no container image.
    if (img.startsWith('native/')) continue;
    const [nameAndReg = img, tag = 'latest'] = img.split(':') as [string, string?];
    const segments = nameAndReg.split('/');
    const imageName = segments[segments.length - 1] ?? nameAndReg;
    const registry = segments.length >= 2 ? (segments[0] ?? 'docker.io') : 'docker.io';
    const sizeMb = imageSizes[imageName] ?? 1200;
    const pulledAt = new Date(Date.now() - Math.floor(between(1, 30)) * 24 * 3600 * 1000).toISOString();
    if (!imageMap.has(img)) {
      imageMap.set(img, {
        id: `img-${imageMap.size + 1}`,
        fullImage: img,
        registry,
        name: imageName,
        tag,
        workspaces: [ws.friendlyName],
        sizeMb,
        pulledAt,
        status: 'available',
      });
    } else {
      imageMap.get(img)!.workspaces.push(ws.friendlyName);
    }
  }
  const images = [...imageMap.values()];

  // Recordings start empty in mock mode — the admin page shows its empty state
  // until a real session is recorded against an S3-configured deployment.
  const recordings: RecordingRow[] = [];

  const bugReports = SEED_BUG_REPORTS.map((b) => ({ ...b }));
  const bugFixes = SEED_BUG_FIXES.map((f) => ({ ...f }));

  return {
    workspaces,
    zones,
    servers: SERVER_DEFS,
    agents,
    sessions,
    users,
    activity,
    history,
    images,
    recordings,
    bugReports,
    bugFixes,
    feedback: FEEDBACK_SEED.map((f) => ({ ...f, notes: [...f.notes] })),
    registries: (() => {
      const counts = registryEntryCounts();
      return REGISTRY_SEED.map((r) => ({ ...r, _count: { entries: counts[r.id] ?? 0 } }));
    })(),
    marketplace: MARKETPLACE_SEED.map((m) => ({ ...m })),
  };
}
