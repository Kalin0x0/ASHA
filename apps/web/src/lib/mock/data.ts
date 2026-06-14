import type {
  Agent,
  ActivityItem,
  HistoryRow,
  ImageRow,
  RecordingRow,
  SessionEndReason,
  SessionRow,
  SessionStatus,
  UserRow,
  Workspace,
  Zone,
} from '@/lib/types';
import { mulberry32 } from '@/lib/utils';

const SEED = 20260601;

const WORKSPACE_DEFS: Array<Omit<Workspace, 'activeSessions'>> = [
  { id: 'ws-firefox', name: 'firefox', friendlyName: 'Firefox', description: 'Isolated Firefox browser session.', category: 'Browsers', cores: 2, memMb: 2768, gpu: 0, enabled: true, dockerImage: 'kasmweb/firefox:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-chrome', name: 'chrome', friendlyName: 'Google Chrome', description: 'Isolated Chrome browser session.', category: 'Browsers', cores: 2, memMb: 2768, gpu: 0, enabled: true, dockerImage: 'kasmweb/chrome:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-tor', name: 'tor', friendlyName: 'Tor Browser', description: 'Non-attributable research browsing.', category: 'Browsers', cores: 2, memMb: 2048, gpu: 0, enabled: true, dockerImage: 'kasmweb/tor-browser:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-desktop', name: 'ubuntu-desktop', friendlyName: 'Ubuntu Desktop', description: 'Full Ubuntu XFCE desktop environment.', category: 'Desktops', cores: 4, memMb: 4096, gpu: 0, enabled: true, dockerImage: 'kasmweb/desktop:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-vscode', name: 'vs-code', friendlyName: 'VS Code', description: 'Cloud development environment.', category: 'Development', cores: 4, memMb: 4096, gpu: 0, enabled: true, dockerImage: 'kasmweb/vs-code:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-terminal', name: 'terminal', friendlyName: 'Terminal', description: 'Hardened Ubuntu terminal.', category: 'Development', cores: 1, memMb: 1024, gpu: 0, enabled: true, dockerImage: 'kasmweb/terminal:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-kali', name: 'kali', friendlyName: 'Kali Linux', description: 'Security testing desktop.', category: 'Security', cores: 4, memMb: 6144, gpu: 0, enabled: true, dockerImage: 'kasmweb/kali-rolling-desktop:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-gimp', name: 'gimp', friendlyName: 'GIMP', description: 'Image editing workspace.', category: 'Creative', cores: 2, memMb: 3072, gpu: 0, enabled: true, dockerImage: 'kasmweb/gimp:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-blender', name: 'blender', friendlyName: 'Blender', description: 'GPU-accelerated 3D suite.', category: 'Creative', cores: 6, memMb: 8192, gpu: 1, enabled: true, dockerImage: 'kasmweb/blender:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-libreoffice', name: 'libreoffice', friendlyName: 'LibreOffice', description: 'Office productivity suite.', category: 'Productivity', cores: 2, memMb: 2768, gpu: 0, enabled: true, dockerImage: 'kasmweb/libre-office:1.16.0', protocol: 'KASMVNC' },
  { id: 'ws-rdp', name: 'windows-11', friendlyName: 'Windows 11', description: 'Windows 11 desktop streamed over RDP.', category: 'Desktops', cores: 4, memMb: 8192, gpu: 0, enabled: true, dockerImage: 'native/rdp', protocol: 'RDP' },
  { id: 'ws-win10', name: 'windows-10', friendlyName: 'Windows 10', description: 'Windows 10 desktop streamed over RDP.', category: 'Desktops', cores: 4, memMb: 6144, gpu: 0, enabled: true, dockerImage: 'native/rdp', protocol: 'RDP' },
  { id: 'ws-winsrv', name: 'windows-server-2022', friendlyName: 'Windows Server 2022', description: 'Windows Server 2022 desktop over RDP.', category: 'Desktops', cores: 6, memMb: 8192, gpu: 0, enabled: true, dockerImage: 'native/rdp', protocol: 'RDP' },
  { id: 'ws-postman', name: 'postman', friendlyName: 'Postman', description: 'API development workspace.', category: 'Development', cores: 2, memMb: 2048, gpu: 0, enabled: true, dockerImage: 'kasmweb/postman:1.16.0', protocol: 'KASMVNC' },
];

const ZONE_DEFS: Array<Pick<Zone, 'id' | 'name' | 'region'>> = [
  { id: 'zone-eu', name: 'eu-frankfurt', region: 'Europe' },
  { id: 'zone-us', name: 'us-east', region: 'North America' },
  { id: 'zone-lab', name: 'homelab', region: 'On-prem' },
];

const USER_NAMES = [
  'Shahin Naiemi', 'Dariush Karimi', 'Leyla Hosseini', 'Arman Tehrani', 'Nadia Farahani',
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
  agents: Agent[];
  sessions: SessionRow[];
  users: UserRow[];
  activity: ActivityItem[];
  history: HistoryRow[];
  images: ImageRow[];
  recordings: RecordingRow[];
}

export function buildInitialData(): MockData {
  const rng = mulberry32(SEED);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const between = (min: number, max: number) => min + rng() * (max - min);

  const users: UserRow[] = USER_NAMES.map((name, i) => {
    const username = name.toLowerCase().replace(/\s+/g, '.');
    return {
      id: `user-${i + 1}`,
      name,
      email: `${username}@chista.local`,
      username,
      status: i === 11 ? 'DISABLED' : i === 12 ? 'INVITED' : 'ACTIVE',
      groups: i < 2 ? ['Administrators', 'All Users'] : ['All Users'],
      twoFactor: rng() > 0.45,
      lastLoginAt: i === 12 ? null : `${Math.floor(between(1, 72))}h ago`,
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
    { id: 'a4', kind: 'admin', actor: 'Shahin Naiemi', message: 'updated workspace "Kali Linux" resource limits', at: '14m ago' },
    { id: 'a5', kind: 'session', actor: 'Nadia Farahani', message: 'terminated a Firefox session', at: '18m ago' },
    { id: 'a6', kind: 'alert', actor: 'system', message: 'CPU on homelap-agent-01 exceeded 85%', at: '22m ago' },
    { id: 'a7', kind: 'admin', actor: 'Shahin Naiemi', message: 'created API key "ci-pipeline"', at: '31m ago' },
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

  return { workspaces, zones, agents, sessions, users, activity, history, images, recordings };
}
