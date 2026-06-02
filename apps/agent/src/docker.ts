import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import Docker from 'dockerode';
import type { ProvisionCommand, SessionSidecar, SessionStatSample } from '@chista/events';
import { routerName, sessionTraefikLabels } from '@chista/proxy-labels';
import { agentEnv } from './env.js';

// Host directory where sidecar config files are written.
// When the agent runs inside Docker, this must be bind-mounted from the host
// so the path is also reachable by Docker sibling containers.
const SIDECAR_DIR = process.env.CHISTA_SIDECAR_DIR ?? '/var/lib/chista/sidecars';

const socketPath =
  process.platform === 'win32' && !process.env.DOCKER_SOCKET
    ? '//./pipe/docker_engine'
    : agentEnv.dockerSocket;

const docker = new Docker({ socketPath });

function parseShm(input?: string): number | undefined {
  if (!input) return undefined;
  const match = /^(\d+)(g|m|k)?$/i.exec(input.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const mult = unit === 'g' ? 2 ** 30 : unit === 'm' ? 2 ** 20 : unit === 'k' ? 2 ** 10 : 1;
  return n * mult;
}

async function ensureImage(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // not present locally → pull
  }
  await new Promise<void>((resolve, reject) => {
    (docker as unknown as {
      pull: (img: string, opts: object, cb: (err: unknown, stream: NodeJS.ReadableStream) => void) => void;
    }).pull(image, {}, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error('pull failed'));
      docker.modem.followProgress(stream, (e: unknown) => (e ? reject(e) : resolve()));
    });
  });
}

export interface ProvisionResult {
  containerId: string;
  internalHost: string;
  port: number;
  routerName: string;
}

export async function provisionContainer(cmd: ProvisionCommand): Promise<ProvisionResult> {
  await ensureImage(cmd.runConfig.dockerImage);

  const port = cmd.runConfig.ports[0] ?? 6901;
  const router = routerName(cmd.kasmId);
  const vncPw = randomBytes(9).toString('base64url');

  const labels: Record<string, string> = {
    ...sessionTraefikLabels({
      kasmId: cmd.kasmId,
      internalPort: port,
      domain: agentEnv.domain,
      network: agentEnv.sessionNetwork,
      forwardAuthMiddleware: 'sess-auth@file',
    }),
    'chista.session.id': cmd.sessionId,
    'chista.org.id': cmd.orgId,
    [`traefik.http.services.${router}.loadbalancer.server.scheme`]:
      cmd.protocol === 'KASMVNC' ? 'https' : 'http',
    [`traefik.http.services.${router}.loadbalancer.serverstransport`]: 'chista-insecure@file',
  };

  const container = await docker.createContainer({
    name: `chista-sess-${cmd.kasmId}`,
    Image: cmd.runConfig.dockerImage,
    Env: [`VNC_PW=${vncPw}`, ...Object.entries(cmd.runConfig.env).map(([k, v]) => `${k}=${v}`)],
    Labels: labels,
    HostConfig: {
      NetworkMode: agentEnv.sessionNetwork,
      ShmSize: parseShm(cmd.runConfig.shmSize),
      Memory: cmd.runConfig.memLimitMb ? cmd.runConfig.memLimitMb * 2 ** 20 : undefined,
      NanoCpus: cmd.runConfig.cores ? Math.round(cmd.runConfig.cores * 1e9) : undefined,
      RestartPolicy: { Name: 'no' },
    },
  });

  await container.start();
  const info = await container.inspect();
  const ip = info.NetworkSettings?.Networks?.[agentEnv.sessionNetwork]?.IPAddress ?? '';

  // Launch optional open-source sidecars on the same session network.
  if (cmd.sidecars && Object.keys(cmd.sidecars).length > 0) {
    await launchSidecars(cmd.kasmId, cmd.sidecars);
  }

  await waitForPort(ip, port, 30_000).catch(() => undefined);

  return { containerId: container.id, internalHost: ip, port, routerName: router };
}

async function launchSidecars(kasmId: string, sidecars: NonNullable<ProvisionCommand['sidecars']>): Promise<void> {
  const dir = join(SIDECAR_DIR, kasmId);
  mkdirSync(dir, { recursive: true });

  const entries: Array<{ name: string; spec: SessionSidecar }> = [
    ...(sidecars.squid ? [{ name: `chista-squid-${kasmId}`, spec: sidecars.squid }] : []),
    ...(sidecars.wireguard ? [{ name: `chista-wg-${kasmId}`, spec: sidecars.wireguard }] : []),
    ...(sidecars.neko ? [{ name: `chista-neko-${kasmId}`, spec: sidecars.neko }] : []),
  ];

  for (const { name, spec } of entries) {
    await ensureImage(spec.image);

    // Write config files and build bind-mounts.
    const binds: string[] = [];
    for (const [mountPath, content] of Object.entries(spec.configs ?? {})) {
      // Use container name as a namespace prefix to avoid collisions.
      const filename = `${name}-${mountPath.replace(/\//g, '_')}`;
      const hostPath = join(dir, filename);
      writeFileSync(hostPath, content, { mode: 0o600 });
      binds.push(`${hostPath}:${mountPath}:ro`);
    }

    const sc = await docker.createContainer({
      name,
      Image: spec.image,
      Env: Object.entries(spec.env ?? {}).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        NetworkMode: agentEnv.sessionNetwork,
        RestartPolicy: { Name: 'no' },
        Binds: binds.length ? binds : undefined,
        CapAdd: spec.capAdd,
      },
      Labels: { 'chista.sidecar.kasmId': kasmId },
    });
    await sc.start();
  }
}

export async function destroyContainer(idOrName: string): Promise<void> {
  const container = docker.getContainer(idOrName);
  await container.stop({ t: 5 }).catch(() => undefined);
  await container.remove({ force: true }).catch(() => undefined);

  // Derive kasmId from session container name (chista-sess-<kasmId>) or
  // from the raw kasmId passed directly, then clean up sidecars.
  const kasmId = idOrName.startsWith('chista-sess-')
    ? idOrName.slice('chista-sess-'.length)
    : idOrName;
  await destroySidecars(kasmId);
}

async function destroySidecars(kasmId: string): Promise<void> {
  const names = [
    `chista-squid-${kasmId}`,
    `chista-wg-${kasmId}`,
    `chista-neko-${kasmId}`,
  ];
  await Promise.allSettled(
    names.map(async (name) => {
      const c = docker.getContainer(name);
      await c.stop({ t: 5 }).catch(() => undefined);
      await c.remove({ force: true }).catch(() => undefined);
    }),
  );
  // Remove config files written for this session.
  rmSync(join(SIDECAR_DIR, kasmId), { recursive: true, force: true });
}

/** map: containerId → sessionId */
export async function collectStats(map: Map<string, string>): Promise<SessionStatSample[]> {
  const samples: SessionStatSample[] = [];
  for (const [containerId, sessionId] of map) {
    try {
      const raw = (await docker.getContainer(containerId).stats({ stream: false })) as unknown as RawStats;
      const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
      const sysDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
      const cpuCount = raw.cpu_stats.online_cpus ?? 1;
      const cpuPct = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;
      const memMb = (raw.memory_stats.usage ?? 0) / 2 ** 20;
      samples.push({ sessionId, cpuPct: Math.round(cpuPct * 10) / 10, memMb: Math.round(memMb) });
    } catch {
      // container gone or stats unavailable
    }
  }
  return samples;
}

interface RawStats {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
  memory_stats: { usage?: number };
}

function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!host) {
        if (Date.now() > deadline) return reject(new Error('no container ip'));
        return void setTimeout(attempt, 500);
      }
      const socket = net.connect({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error('readiness probe timeout'));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}
