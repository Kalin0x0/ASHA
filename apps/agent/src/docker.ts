import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import Docker from 'dockerode';
import type { ProvisionCommand, SessionSidecar, SessionStatSample, StreamProfile } from '@chista/events';
import { routerName, sessionTraefikLabels } from '@chista/proxy-labels';
import { agentEnv } from './env.js';

// Host directory where sidecar config files are written.
// When the agent runs inside Docker, this must be bind-mounted from the host
// so the path is also reachable by Docker sibling containers.
const SIDECAR_DIR = process.env.CHISTA_SIDECAR_DIR ?? '/var/lib/chista/sidecars';
const RECORDING_DIR = process.env.CHISTA_RECORDING_DIR ?? '/var/lib/chista/recordings';

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

/** Host devices to pass through, including the VAAPI render node when selected. */
function gpuDevices(cmd: ProvisionCommand): string[] {
  const devices = [...(cmd.runConfig.devices ?? [])];
  if (cmd.runConfig.gpu?.encoder === 'vaapi') {
    devices.push(cmd.runConfig.gpu.renderDevice ?? '/dev/dri/renderD128');
  }
  return devices;
}

/** Env hints the streaming image reads to pick its hardware encoder. */
function gpuEnv(cmd: ProvisionCommand): Record<string, string> {
  const gpu = cmd.runConfig.gpu;
  if (!gpu || gpu.encoder === 'none' || !gpu.encoder) return {};
  if (gpu.encoder === 'nvenc') {
    return {
      NVIDIA_VISIBLE_DEVICES: 'all',
      NVIDIA_DRIVER_CAPABILITIES: 'all',
      CHISTA_HW_ENCODER: 'nvenc',
    };
  }
  // vaapi
  return { CHISTA_HW_ENCODER: 'vaapi', LIBVA_DRIVER_NAME: 'iHD' };
}

export async function provisionContainer(cmd: ProvisionCommand): Promise<ProvisionResult> {
  await ensureImage(cmd.runConfig.dockerImage);

  const port = cmd.runConfig.ports[0] ?? 6901;
  const router = routerName(cmd.kasmId);
  const vncPw = randomBytes(9).toString('base64url');

  // Custom labels must NOT register their own Traefik routers (cross-tenant
  // route-hijack guard); strip any traefik.* keys before merging.
  const customLabels = Object.fromEntries(
    Object.entries(cmd.runConfig.labels ?? {}).filter(([k]) => !/^traefik\./i.test(k)),
  );
  const labels: Record<string, string> = {
    ...customLabels,
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

  // KasmVNC's web server requires HTTP Basic Auth (kasm_user:VNC_PW), but the
  // browser loads the session iframe with only `?token=`. Inject the credentials
  // at the edge via a per-session Traefik header middleware so the desktop streams
  // without a 401. `kasm_user` is the default basic-auth user in the kasmweb images.
  if (cmd.protocol === 'KASMVNC') {
    const basic = Buffer.from(`kasm_user:${vncPw}`).toString('base64');
    labels[`traefik.http.middlewares.${router}-auth.headers.customrequestheaders.Authorization`] = `Basic ${basic}`;
    const existing = labels[`traefik.http.routers.${router}.middlewares`];
    labels[`traefik.http.routers.${router}.middlewares`] = existing
      ? `${existing},${router}-auth`
      : `${router}-auth`;
  }

  // ── Container-security sanitization (shared multi-tenant hosts) ─────────────
  // Privileged mode, dangerous Linux capabilities, and seccomp/apparmor-
  // disabling securityOpts are gated behind a deployment-level env so org admins
  // (who author dockerConfig) cannot grant themselves host-escape on a host that
  // also runs other tenants' sessions.
  const allowPrivileged = process.env.CHISTA_ALLOW_PRIVILEGED === 'true';
  const CAP_DENYLIST = new Set([
    'SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'SYS_RAWIO', 'SYS_BOOT', 'SYS_TIME',
    'DAC_READ_SEARCH', 'DAC_OVERRIDE', 'NET_ADMIN', 'NET_RAW', 'MKNOD', 'AUDIT_CONTROL',
    'MAC_ADMIN', 'MAC_OVERRIDE', 'SETUID', 'SETGID', 'ALL',
  ]);
  const normCap = (c: string) => c.toUpperCase().replace(/^CAP_/, '');
  const safeCapAdd = allowPrivileged
    ? cmd.runConfig.capAdd ?? []
    : (cmd.runConfig.capAdd ?? []).filter((c) => !CAP_DENYLIST.has(normCap(c)));
  const safeSecurityOpt = allowPrivileged
    ? cmd.runConfig.securityOpt ?? []
    : (cmd.runConfig.securityOpt ?? []).filter((o) => !/unconfined/i.test(o));
  const privileged = Boolean(cmd.runConfig.privileged) && allowPrivileged;
  // Ephemeral session containers must never auto-restart forever; clamp policy.
  const restartPolicy: { Name: NonNullable<typeof cmd.runConfig.restartPolicy>; MaximumRetryCount?: number } =
    cmd.runConfig.restartPolicy === 'on-failure'
      ? { Name: 'on-failure', MaximumRetryCount: 3 }
      : { Name: 'no' };

  const container = await docker.createContainer({
    name: `chista-sess-${cmd.kasmId}`,
    Image: cmd.runConfig.dockerImage,
    // System env (VNC_PW + GPU hints) spread LAST so admin dockerConfig.env
    // cannot override the per-session password or encoder selection.
    Env: Object.entries({ ...cmd.runConfig.env, ...gpuEnv(cmd), VNC_PW: vncPw }).map(([k, v]) => `${k}=${v}`),
    Labels: labels,
    HostConfig: {
      NetworkMode: agentEnv.sessionNetwork,
      ShmSize: parseShm(cmd.runConfig.shmSize),
      Memory: cmd.runConfig.memLimitMb ? cmd.runConfig.memLimitMb * 2 ** 20 : undefined,
      NanoCpus: cmd.runConfig.cores ? Math.round(cmd.runConfig.cores * 1e9) : undefined,
      RestartPolicy: restartPolicy,
      // E1: admin-defined volume mappings (host path → container path, ro/rw).
      ...(cmd.runConfig.volumes?.length
        ? { Binds: cmd.runConfig.volumes.map((v) => `${v.source}:${v.target}${v.readOnly ? ':ro' : ''}`) }
        : {}),
      // Workspace hardening knobs — sanitized above (denylisted caps / privileged
      // / seccomp-apparmor-disabling dropped unless CHISTA_ALLOW_PRIVILEGED).
      ...(safeCapAdd.length ? { CapAdd: safeCapAdd } : {}),
      ...(cmd.runConfig.capDrop?.length ? { CapDrop: cmd.runConfig.capDrop } : {}),
      ...(safeSecurityOpt.length ? { SecurityOpt: safeSecurityOpt } : {}),
      ...(privileged ? { Privileged: true } : {}),
      // Device passthrough: webcam (/dev/video0), USB (/dev/bus/usb), smartcard (/dev/pcsc), etc.
      // VAAPI adds the DRI render node for hardware H.264 encoding.
      Devices: gpuDevices(cmd).map((p) => ({
        PathOnHost: p,
        PathInContainer: p,
        CgroupPermissions: 'rwm',
      })),
      // NVENC requests an NVIDIA GPU via the nvidia-container-runtime.
      ...(cmd.runConfig.gpu?.encoder === 'nvenc'
        ? {
            DeviceRequests: [
              { Driver: 'nvidia', Count: cmd.runConfig.gpu.count ?? -1, Capabilities: [['gpu']] },
            ],
          }
        : {}),
    },
  });

  try {
    await container.start();
    const info = await container.inspect();
    const ip = info.NetworkSettings?.Networks?.[agentEnv.sessionNetwork]?.IPAddress ?? '';

    // Launch optional open-source sidecars on the same session network.
    if (cmd.sidecars && Object.keys(cmd.sidecars).length > 0) {
      await launchSidecars(cmd.kasmId, cmd.sidecars);
    }

    await waitForPort(ip, port, 30_000).catch(() => undefined);

    return { containerId: container.id, internalHost: ip, port, routerName: router };
  } catch (e) {
    // Provisioning failed after the container was created. The manager never
    // learns the container id (provisionContainer rejects), so it can't call
    // destroyContainer later — tear the container + any sidecars down here to
    // avoid leaking a running container.
    await destroyContainer(`chista-sess-${cmd.kasmId}`).catch(() => undefined);
    throw e;
  }
}

async function launchSidecars(kasmId: string, sidecars: NonNullable<ProvisionCommand['sidecars']>): Promise<void> {
  const dir = join(SIDECAR_DIR, kasmId);
  mkdirSync(dir, { recursive: true });

  const entries: Array<{ name: string; spec: SessionSidecar }> = [
    ...(sidecars.squid ? [{ name: `chista-squid-${kasmId}`, spec: sidecars.squid }] : []),
    ...(sidecars.wireguard ? [{ name: `chista-wg-${kasmId}`, spec: sidecars.wireguard }] : []),
    ...(sidecars.neko ? [{ name: `chista-neko-${kasmId}`, spec: sidecars.neko }] : []),
    ...(sidecars.audio ? [{ name: `chista-audio-${kasmId}`, spec: sidecars.audio }] : []),
    ...(sidecars.printing ? [{ name: `chista-print-${kasmId}`, spec: sidecars.printing }] : []),
    ...(sidecars.storage ?? []).map((spec, i) => ({ name: `chista-storage-${kasmId}-${i}`, spec })),
  ];

  for (const { name, spec } of entries) {
    // A failing sidecar (image pull / missing /dev/fuse / bad config) must not
    // break the session — best-effort per sidecar.
    try {
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
      ...(spec.cmd?.length ? { Cmd: spec.cmd } : {}),
      HostConfig: {
        NetworkMode: agentEnv.sessionNetwork,
        RestartPolicy: { Name: 'no' },
        Binds: binds.length ? binds : undefined,
        CapAdd: spec.capAdd,
        ...(spec.devices?.length
          ? {
              Devices: spec.devices.map((p) => ({
                PathOnHost: p,
                PathInContainer: p,
                CgroupPermissions: 'rwm',
              })),
            }
          : {}),
      },
      Labels: { 'chista.sidecar.kasmId': kasmId },
    });
    await sc.start();
    } catch {
      // Swallow — keep the session up even if one sidecar can't start.
    }
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
  // Label sweep catches every sidecar for this session, including the
  // index-named storage (rclone) sidecars.
  const containers = await docker
    .listContainers({ all: true, filters: { label: [`chista.sidecar.kasmId=${kasmId}`] } })
    .catch(() => []);
  await Promise.allSettled(
    containers.map(async (info) => {
      const c = docker.getContainer(info.Id);
      await c.stop({ t: 5 }).catch(() => undefined);
      await c.remove({ force: true }).catch(() => undefined);
    }),
  );
  // Remove config files written for this session.
  rmSync(join(SIDECAR_DIR, kasmId), { recursive: true, force: true });
}

/** Freeze all processes in the session container (SIGSTOP via the freezer cgroup). */
export async function pauseContainer(idOrName: string): Promise<void> {
  await docker.getContainer(idOrName).pause();
}

/** Thaw a previously paused container. */
export async function unpauseContainer(idOrName: string): Promise<void> {
  await docker.getContainer(idOrName).unpause();
}

/**
 * Push a new screen geometry into the running session. KasmVNC/Neko images read
 * CHISTA_RESIZE from a helper; we exec `chista-resize` if present, otherwise this
 * is a best-effort no-op (the browser-side client also negotiates geometry).
 */
export async function resizeContainer(idOrName: string, width: number, height: number): Promise<void> {
  try {
    const exec = await docker.getContainer(idOrName).exec({
      Cmd: ['/bin/sh', '-c', `command -v chista-resize >/dev/null 2>&1 && chista-resize ${width} ${height} || true`],
      AttachStdout: false,
      AttachStderr: false,
    });
    await exec.start({ Detach: true });
  } catch {
    // Geometry is also negotiated client-side; ignore images without the helper.
  }
}

/**
 * Push a live stream-control profile into the running session. DLP-capable
 * KasmVNC builds read it via a `chista-stream` helper; otherwise this is a
 * best-effort no-op (the browser-side client also applies quality/fps/clipboard).
 */
export async function applyStreamProfile(idOrName: string, profile: StreamProfile): Promise<void> {
  try {
    const json = JSON.stringify(profile).replace(/'/g, '');
    const exec = await docker.getContainer(idOrName).exec({
      Cmd: ['/bin/sh', '-c', `command -v chista-stream >/dev/null 2>&1 && chista-stream '${json}' || true`],
      AttachStdout: false,
      AttachStderr: false,
    });
    await exec.start({ Detach: true });
  } catch {
    // Quality/fps are also negotiated client-side; ignore images without the helper.
  }
}

/**
 * Start a best-effort recorder sidecar that shares the session container's network
 * namespace and writes to the recordings dir. Pluggable via CHISTA_RECORDER_IMAGE;
 * when unset this is a no-op (the manager still tracks the Recording row, so a
 * recorder image can be wired in later without app changes).
 */
export async function startRecorder(
  sessionContainerId: string,
  sessionId: string,
  recordingId: string,
): Promise<void> {
  const image = process.env.CHISTA_RECORDER_IMAGE;
  if (!image) return;
  try {
    const out = join(RECORDING_DIR, recordingId);
    mkdirSync(out, { recursive: true });
    const c = await docker.createContainer({
      Image: image,
      name: `chista-rec-${sessionId}`,
      Env: [`RECORDING_ID=${recordingId}`, 'OUTPUT_DIR=/recordings'],
      HostConfig: {
        NetworkMode: `container:${sessionContainerId}`,
        Binds: [`${out}:/recordings`],
        RestartPolicy: { Name: 'no' },
      },
    });
    await c.start();
  } catch {
    // Best-effort: a missing/own-failing recorder image must not break the session.
  }
}

/** Stop + remove the recorder sidecar for a session, if present. */
export async function stopRecorder(sessionId: string): Promise<void> {
  try {
    const c = docker.getContainer(`chista-rec-${sessionId}`);
    await c.stop({ t: 5 }).catch(() => undefined);
    await c.remove({ force: true }).catch(() => undefined);
  } catch {
    // No recorder running (e.g. no recorder image configured).
  }
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
