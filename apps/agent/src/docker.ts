import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import Docker from 'dockerode';
import type { ProvisionCommand, SessionSidecar, SessionStatSample, StreamProfile } from '@asha/events';
import { routerName, sessionPath, sessionTraefikLabels } from '@asha/proxy-labels';
import { agentEnv } from './env.js';
import type { ObservationCapture } from './observation.js';

// Host directory where sidecar config files are written.
// When the agent runs inside Docker, this must be bind-mounted from the host
// so the path is also reachable by Docker sibling containers.
const SIDECAR_DIR = process.env.ASHA_SIDECAR_DIR ?? '/var/lib/asha/sidecars';
const RECORDING_DIR = process.env.ASHA_RECORDING_DIR ?? '/var/lib/asha/recordings';

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

/** Pull an image, resolving once the layer stream completes. */
async function pullImageRaw(image: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    (docker as unknown as {
      pull: (img: string, opts: object, cb: (err: unknown, stream: NodeJS.ReadableStream) => void) => void;
    }).pull(image, {}, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error('pull failed'));
      docker.modem.followProgress(stream, (e: unknown) => (e ? reject(e) : resolve()));
    });
  });
}

async function ensureImage(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // not present locally → pull
  }
  await pullImageRaw(image);
}

/**
 * Force a (re-)pull of an image so a re-installed workspace is ready before its
 * first launch and picks up the latest tag contents. Used by the registry
 * "reinstall" action.
 */
export async function pullImage(image: string): Promise<void> {
  await pullImageRaw(image);
}

/**
 * Remove a cached Docker image from the host to reclaim disk space (registry
 * "remove"/uninstall). Returns the bytes freed. A missing image (already gone)
 * is treated as success. Dangling layers left behind are pruned unless disabled.
 */
export async function removeImage(
  image: string,
  opts: { prune?: boolean } = {},
): Promise<{ removed: boolean; freedBytes: number }> {
  let freedBytes = 0;
  try {
    const info = (await docker.getImage(image).inspect()) as { Size?: number };
    freedBytes = typeof info.Size === 'number' ? info.Size : 0;
  } catch {
    // Not present locally — nothing to reclaim.
    return { removed: false, freedBytes: 0 };
  }
  // force:false keeps us safe if a container still references it (the API
  // pre-flight already guards active sessions; this is belt-and-braces).
  await docker.getImage(image).remove({ force: false });
  let prunedBytes = 0;
  if (opts.prune !== false) {
    try {
      const res = (await docker.pruneImages({ filters: JSON.stringify({ dangling: ['true'] }) })) as {
        SpaceReclaimed?: number;
      };
      prunedBytes = typeof res.SpaceReclaimed === 'number' ? res.SpaceReclaimed : 0;
    } catch {
      // pruning is best-effort hygiene; ignore failures.
    }
  }
  return { removed: true, freedBytes: freedBytes + prunedBytes };
}

/**
 * Maintenance: `docker restart` every sibling container belonging to the given
 * compose service(s) on this host — used by the scheduler to restart the
 * RDP/VNC/SSH bridge (connection-proxy + guacd, the "terminal server") without
 * the API needing the Docker socket. Scoped to the `asha` compose project so it
 * can never touch unrelated containers. Best-effort per container.
 */
export async function restartComposeService(services: string[]): Promise<{ restarted: string[] }> {
  const restarted: string[] = [];
  for (const service of services) {
    const list = await docker
      .listContainers({
        all: true,
        filters: JSON.stringify({
          label: ['com.docker.compose.project=asha', `com.docker.compose.service=${service}`],
        }),
      })
      .catch(() => [] as Array<{ Id: string; Names?: string[] }>);
    for (const info of list) {
      try {
        await docker.getContainer(info.Id).restart({ t: 10 });
        restarted.push((info.Names?.[0] ?? info.Id).replace(/^\//, ''));
      } catch {
        // Best-effort: a container that's mid-restart / already gone is skipped.
      }
    }
  }
  return { restarted };
}

/**
 * Maintenance: reclaim DANGLING image layers on the agent host (disk hygiene).
 * Deliberately dangling-only — never an `-a` prune, which would delete images
 * backing installed-but-currently-stopped workspaces. Returns bytes reclaimed.
 */
export async function pruneDanglingImages(): Promise<{ reclaimedBytes: number }> {
  try {
    const res = (await docker.pruneImages({ filters: JSON.stringify({ dangling: ['true'] }) })) as {
      SpaceReclaimed?: number;
    };
    return { reclaimedBytes: typeof res.SpaceReclaimed === 'number' ? res.SpaceReclaimed : 0 };
  } catch {
    return { reclaimedBytes: 0 };
  }
}

export interface ProvisionResult {
  containerId: string;
  internalHost: string;
  port: number;
  routerName: string;
  /**
   * Whether the read-only KasmVNC account really exists in this image. False for
   * anything that only resembles Kasm, and the manager then withholds the live
   * view instead of sending an admin to a 401.
   */
  viewerAuth: boolean;
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
      ASHA_HW_ENCODER: 'nvenc',
    };
  }
  // vaapi
  return { ASHA_HW_ENCODER: 'vaapi', LIBVA_DRIVER_NAME: 'iHD' };
}

/**
 * Start CUPS + create the virtual PDF printer queue inside a kasmweb session.
 * The image ships start_cups.sh but nothing ever calls it (it needs root; the
 * container's PID1 runs as kasm-user), so without this the guest has no printer.
 * Uses a DAEMONIZING `cupsd` (NOT `cupsd -f &`, which start_cups.sh does and which
 * gets reaped when the exec exits). Idempotent via `pgrep cupsd`. Fire-and-forget:
 * the script finishes in ~1-2s in-container; cupsd forks and persists.
 */
async function bootstrapCups(container: Docker.Container): Promise<void> {
  const script =
    'ulimit -n 1024; ' +
    'pgrep cupsd >/dev/null 2>&1 || /usr/sbin/cupsd; ' +
    'for i in $(seq 1 30); do lpstat -r 2>/dev/null | grep -q "scheduler is running" && break; sleep 0.5; done; ' +
    'lpadmin -p Kasm-Printer -E -v cups-pdf:/ -P /etc/cups/ppd/kasm.ppd 2>/dev/null; ' +
    'lpadmin -p Kasm-Printer -o print-color-mode-default=color 2>/dev/null; ' +
    'lpadmin -d Kasm-Printer 2>/dev/null; ' +
    'true';
  const exec = await container.exec({
    User: 'root',
    Cmd: ['bash', '-c', script],
    AttachStdout: false,
    AttachStderr: false,
  });
  await exec.start({ Detach: true });
}

/**
 * Give the image's read-only KasmVNC account a password of our own.
 *
 * kasmweb images ship `kasm_viewer` (read, no write) next to `kasm_user`, but
 * nothing sets its password, so it answers 401 — and `VNC_VIEW_ONLY_PW` in the
 * container env does NOT set it either (measured). Writing the entry directly
 * is what works. Runs as the image's default user: kasm-user owns
 * `~/.kasmpasswd`, and the root that bootstrapCups needs would write a file the
 * VNC server cannot read.
 *
 * `printf` rather than `echo -e`: /bin/sh is dash in these images and would
 * pass `-e` through as text, making it the first line of the password.
 */
async function bootstrapViewerPassword(
  container: Docker.Container,
  password: string,
): Promise<boolean> {
  // Attached, not detached like the other bootstraps, because the ANSWER
  // matters: images that only look like Kasm (the linuxserver ones serve their
  // desktop through nginx and ship no kasmvncpasswd) would otherwise get an
  // observe route that authenticates nobody, and an admin would click "watch"
  // into a 401. Reporting the failure lets the manager withhold the offer.
  const script =
    'command -v kasmvncpasswd >/dev/null 2>&1 || exit 1; ' +
    `printf '%s\n%s\n' '${password}' '${password}' | ` +
    'kasmvncpasswd -u kasm_viewer -r "${HOME:-/home/kasm-user}/.kasmpasswd" >/dev/null 2>&1 ' +
    "&& printf 'ok'";
  try {
    const exec = await container.exec({
      Cmd: ['/bin/sh', '-c', script],
      AttachStdout: true,
      AttachStderr: false,
    });
    const stream = (await exec.start({ hijack: true, stdin: false })) as Duplex;
    const { stdout } = await readExecStdout(stream, 1024, 5_000);
    return stdout.toString('utf8').includes('ok');
  } catch {
    return false;
  }
}

export async function provisionContainer(cmd: ProvisionCommand): Promise<ProvisionResult> {
  await ensureImage(cmd.runConfig.dockerImage);

  const port = cmd.runConfig.ports[0] ?? 6901;
  const router = routerName(cmd.kasmId);
  const vncPw = randomBytes(9).toString('base64url');
  // Second, weaker credential for the same desktop: it may look, never touch.
  // Same charset as vncPw, so neither ends up needing quoting in a shell or a
  // Basic header.
  const viewPw = randomBytes(9).toString('base64url');
  // Set once the read-only account answers; the manager only offers a live view
  // for a session where it does.
  let viewerAuth = false;

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
    'asha.session.id': cmd.sessionId,
    'asha.org.id': cmd.orgId,
    [`traefik.http.services.${router}.loadbalancer.server.scheme`]:
      cmd.protocol === 'KASMVNC' ? 'https' : 'http',
    [`traefik.http.services.${router}.loadbalancer.serverstransport`]: 'asha-insecure@file',
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

    // Audio-out: the kasmweb image runs a jsmpeg WSS relay on container :4901
    // (TLS self-signed, Basic kasm_user:VNC_PW) carrying an MPEG-TS audio stream.
    // Expose it as a SECOND per-session router under /session/<id>/audio so the
    // viewer's audio player can reach it. It reuses the SAME per-session Basic
    // header (the relay needs kasm_user:VNC_PW) and the per-session forward-auth,
    // so it can't widen the security envelope beyond the existing 6901 stream.
    // Higher priority than the 6901 router so the longer prefix wins.
    const audioRouter = `${router}-audio`;
    const audioPath = `${sessionPath(cmd.kasmId)}/audio`;
    labels[`traefik.http.routers.${audioRouter}.rule`] = `PathPrefix(\`${audioPath}\`)`;
    labels[`traefik.http.routers.${audioRouter}.entrypoints`] = 'websecure';
    labels[`traefik.http.routers.${audioRouter}.tls`] = 'true';
    labels[`traefik.http.routers.${audioRouter}.priority`] = '100';
    // Explicit router→service link (required with >1 service on the container).
    labels[`traefik.http.routers.${audioRouter}.service`] = audioRouter;
    labels[`traefik.http.middlewares.${audioRouter}-strip.stripprefix.prefixes`] = audioPath;
    // sess-auth first, for the same reason as the main router: the gate reads the
    // session id out of the path, and the strip would have taken it away.
    labels[`traefik.http.routers.${audioRouter}.middlewares`] = `sess-auth@file,${audioRouter}-strip,${router}-auth`;
    labels[`traefik.http.services.${audioRouter}.loadbalancer.server.port`] = '4901';
    labels[`traefik.http.services.${audioRouter}.loadbalancer.server.scheme`] = 'https';
    labels[`traefik.http.services.${audioRouter}.loadbalancer.serverstransport`] = 'asha-insecure@file';

    // Observation: a THIRD router onto the same 6901 stream, differing only in
    // which account it authenticates as. The route above carries kasm_user and
    // is write-capable by construction, so an administrator watching a desktop
    // needs a route of its own — read-only is then enforced by KasmVNC itself
    // (kasm_viewer has write:false) rather than by whichever client is loaded,
    // and joining does not evict the person working
    // (`new_session_disconnects_existing_exclusive_session: false`).
    const observeRouter = `${router}-observe`;
    const observePath = `${sessionPath(cmd.kasmId)}/observe`;
    const observeBasic = Buffer.from(`kasm_viewer:${viewPw}`).toString('base64');
    labels[`traefik.http.middlewares.${observeRouter}-auth.headers.customrequestheaders.Authorization`] =
      `Basic ${observeBasic}`;
    labels[`traefik.http.routers.${observeRouter}.rule`] = `PathPrefix(\`${observePath}\`)`;
    labels[`traefik.http.routers.${observeRouter}.entrypoints`] = 'websecure';
    labels[`traefik.http.routers.${observeRouter}.tls`] = 'true';
    labels[`traefik.http.routers.${observeRouter}.priority`] = '100';
    // Explicit router→service link (required with >1 service on the container).
    labels[`traefik.http.routers.${observeRouter}.service`] = observeRouter;
    labels[`traefik.http.middlewares.${observeRouter}-strip.stripprefix.prefixes`] = observePath;
    // sess-auth first, for the same reason as the audio router.
    labels[`traefik.http.routers.${observeRouter}.middlewares`] =
      `sess-auth@file,${observeRouter}-strip,${observeRouter}-auth`;
    labels[`traefik.http.services.${observeRouter}.loadbalancer.server.port`] = String(port);
    labels[`traefik.http.services.${observeRouter}.loadbalancer.server.scheme`] = 'https';
    labels[`traefik.http.services.${observeRouter}.loadbalancer.serverstransport`] = 'asha-insecure@file';
  }

  // ── Container-security sanitization (shared multi-tenant hosts) ─────────────
  // Privileged mode, dangerous Linux capabilities, and seccomp/apparmor-
  // disabling securityOpts are gated behind a deployment-level env so org admins
  // (who author dockerConfig) cannot grant themselves host-escape on a host that
  // also runs other tenants' sessions.
  const allowPrivileged = process.env.ASHA_ALLOW_PRIVILEGED === 'true';
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

  // WEBRTC (Neko) media plane: signaling (TCP 8080) stays on the Docker network
  // (Traefik serves it via the per-session label), but the WebRTC MEDIA plane is
  // UDP and the remote browser must reach it directly — so publish Neko's single
  // UDP mux port to the host. The host port MUST equal the container port because
  // Neko advertises its ICE candidate as <public-ip>:<mux> (NAT1TO1); the
  // Speedport→OPNsense forward lands on host:<mux> → container:<mux>.
  const webrtcMuxPort =
    cmd.protocol === 'WEBRTC'
      ? Number(cmd.runConfig.env?.NEKO_WEBRTC_UDPMUX ?? 59000) || 59000
      : undefined;

  const container = await docker.createContainer({
    name: `asha-sess-${cmd.kasmId}`,
    Image: cmd.runConfig.dockerImage,
    // System env (VNC_PW + GPU hints) spread LAST so admin dockerConfig.env
    // cannot override the per-session password or encoder selection.
    Env: Object.entries({ ...cmd.runConfig.env, ...gpuEnv(cmd), VNC_PW: vncPw }).map(([k, v]) => `${k}=${v}`),
    Labels: labels,
    // WEBRTC only: expose the Neko UDP media port so it can be published to the
    // host. (TCP 8080 signaling is intentionally NOT published — Traefik serves
    // it over the Docker network; publishing only UDP can't collide with it.)
    ...(webrtcMuxPort ? { ExposedPorts: { [`${webrtcMuxPort}/udp`]: {} } } : {}),
    HostConfig: {
      NetworkMode: agentEnv.sessionNetwork,
      // Map host UDP <mux> → container UDP <mux> (same number — Neko's ICE
      // candidate advertises exactly this port). The session network is a named
      // bridge, so PortBindings are honoured.
      ...(webrtcMuxPort
        ? { PortBindings: { [`${webrtcMuxPort}/udp`]: [{ HostPort: String(webrtcMuxPort) }] } }
        : {}),
      ShmSize: parseShm(cmd.runConfig.shmSize),
      Memory: cmd.runConfig.memLimitMb ? cmd.runConfig.memLimitMb * 2 ** 20 : undefined,
      NanoCpus: cmd.runConfig.cores ? Math.round(cmd.runConfig.cores * 1e9) : undefined,
      RestartPolicy: restartPolicy,
      // E1: admin-defined volume mappings (host path → container path, ro/rw).
      ...(cmd.runConfig.volumes?.length
        ? { Binds: cmd.runConfig.volumes.map((v) => `${v.source}:${v.target}${v.readOnly ? ':ro' : ''}`) }
        : {}),
      // Workspace hardening knobs — sanitized above (denylisted caps / privileged
      // / seccomp-apparmor-disabling dropped unless ASHA_ALLOW_PRIVILEGED).
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

    // kasmweb images ship /etc/cups/start_cups.sh but never call it (it needs
    // root, and PID1 runs as uid 1000 kasm-user) → cupsd never starts and the
    // guest has NO printer queue, so "Drucker geht nicht". Bootstrap CUPS here as
    // root (the agent has root docker). Skipped when DLP disables printing.
    if (cmd.protocol === 'KASMVNC' && cmd.runConfig.env?.KASM_SVC_PRINTER !== '0') {
      await bootstrapCups(container).catch(() => undefined); // best-effort, never fail a session
    }

    // The observe router above already carries kasm_viewer; the account only
    // starts answering once it has this password. A third-party image without
    // kasmvncpasswd loses the read-only route, which must not cost the user
    // their desktop — best-effort, exactly like the CUPS bootstrap.
    if (cmd.protocol === 'KASMVNC') {
      viewerAuth = await bootstrapViewerPassword(container, viewPw).catch(() => false);
    }

    return { containerId: container.id, internalHost: ip, port, routerName: router, viewerAuth };
  } catch (e) {
    // Provisioning failed after the container was created. The manager never
    // learns the container id (provisionContainer rejects), so it can't call
    // destroyContainer later — tear the container + any sidecars down here to
    // avoid leaking a running container.
    await destroyContainer(`asha-sess-${cmd.kasmId}`).catch(() => undefined);
    throw e;
  }
}

async function launchSidecars(kasmId: string, sidecars: NonNullable<ProvisionCommand['sidecars']>): Promise<void> {
  const dir = join(SIDECAR_DIR, kasmId);
  mkdirSync(dir, { recursive: true });

  const entries: Array<{ name: string; spec: SessionSidecar }> = [
    ...(sidecars.squid ? [{ name: `asha-squid-${kasmId}`, spec: sidecars.squid }] : []),
    ...(sidecars.wireguard ? [{ name: `asha-wg-${kasmId}`, spec: sidecars.wireguard }] : []),
    ...(sidecars.neko ? [{ name: `asha-neko-${kasmId}`, spec: sidecars.neko }] : []),
    ...(sidecars.audio ? [{ name: `asha-audio-${kasmId}`, spec: sidecars.audio }] : []),
    ...(sidecars.printing ? [{ name: `asha-print-${kasmId}`, spec: sidecars.printing }] : []),
    ...(sidecars.storage ?? []).map((spec, i) => ({ name: `asha-storage-${kasmId}-${i}`, spec })),
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
      Labels: { 'asha.sidecar.kasmId': kasmId },
    });
    await sc.start();
    } catch {
      // Swallow — keep the session up even if one sidecar can't start.
    }
  }
}

export async function destroyContainer(idOrName: string): Promise<void> {
  const container = docker.getContainer(idOrName);
  // Resolve kasmId from the container NAME before removal — destroy is usually
  // called with the opaque container id, from which kasmId can't be derived.
  let kasmId = idOrName.startsWith('asha-sess-') ? idOrName.slice('asha-sess-'.length) : idOrName;
  try {
    const nm = ((await container.inspect()).Name ?? '').replace(/^\//, '');
    if (nm.startsWith('asha-sess-')) kasmId = nm.slice('asha-sess-'.length);
  } catch {
    // Container already gone; fall back to the derived id.
  }
  await container.stop({ t: 5 }).catch(() => undefined);
  await container.remove({ force: true }).catch(() => undefined);
  await destroySidecars(kasmId);
}

async function destroySidecars(kasmId: string): Promise<void> {
  // Label sweep catches every sidecar for this session, including the
  // index-named storage (rclone) sidecars.
  const containers = await docker
    .listContainers({ all: true, filters: JSON.stringify({ label: [`asha.sidecar.kasmId=${kasmId}`] }) })
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
 * ASHA_RESIZE from a helper; we exec `asha-resize` if present, otherwise this
 * is a best-effort no-op (the browser-side client also negotiates geometry).
 */
export async function resizeContainer(idOrName: string, width: number, height: number): Promise<void> {
  try {
    const exec = await docker.getContainer(idOrName).exec({
      Cmd: ['/bin/sh', '-c', `command -v asha-resize >/dev/null 2>&1 && asha-resize ${width} ${height} || true`],
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
 * KasmVNC builds read it via a `asha-stream` helper; otherwise this is a
 * best-effort no-op (the browser-side client also applies quality/fps/clipboard).
 */
export async function applyStreamProfile(idOrName: string, profile: StreamProfile): Promise<void> {
  try {
    const json = JSON.stringify(profile).replace(/'/g, '');
    const exec = await docker.getContainer(idOrName).exec({
      Cmd: ['/bin/sh', '-c', `command -v asha-stream >/dev/null 2>&1 && asha-stream '${json}' || true`],
      AttachStdout: false,
      AttachStderr: false,
    });
    await exec.start({ Detach: true });
  } catch {
    // Quality/fps are also negotiated client-side; ignore images without the helper.
  }
}

/** A wedged container must not pin the agent: abort the read past this. */
const CAPTURE_TIMEOUT_MS = 5_000;
/**
 * Ceilings for the helpers themselves. Abandoning the read only drops the
 * agent's end of the exec — Docker keeps the processes inside the container
 * running, and there is no API to kill an exec — so a display that stopped
 * answering would otherwise leave an `sh` and an `ffmpeg` behind on every pass.
 * A property read takes milliseconds and the frame grab was measured at ~300 ms;
 * both limits are headroom chosen so a wedged pass is gone before the pass after
 * next starts.
 */
const CAPTURE_META_KILL_SEC = 1;
const CAPTURE_FRAME_KILL_SEC = 4;
/** Hard read cap, so a stream that never ends cannot grow the agent's heap. */
const MAX_CAPTURE_BYTES = 131_072;
/**
 * Largest frame that still fits the wire contract: the sample carries the image
 * base64-encoded in a 131_072-character field, and base64 grows 3 bytes into 4.
 */
const MAX_IMAGE_BYTES = 98_304;

/**
 * One observation pass inside a running session: which window has focus, how
 * many are open, and a small WebP frame of the display.
 *
 * Runs as the image's default user — PID 1 in the kasmweb images is the
 * unprivileged kasm-user and owns the X display, so the `User: 'root'` that
 * bootstrapCups needs would leave this with no display to grab.
 *
 * Every helper is guarded with `command -v`: workspace images are third-party
 * and unpinned to this repo, so a missing binary has to degrade the sample and
 * never fail the session.
 */
export async function captureObservation(
  idOrName: string,
  opts: { thumbWidth?: number } = {},
): Promise<ObservationCapture> {
  const width = clampThumbWidth(opts.thumbWidth);
  // Metadata and frame come out of ONE exec (~135 ms of overhead each), so they
  // describe the same moment. A nonce generated per capture separates the two
  // halves of stdout — no window title can collide with it, unlike a fixed
  // marker, and unlike JSON assembled in the shell out of titles the guest owns.
  const nonce = randomBytes(9).toString('hex');
  const script = `
export DISPLAY=:1
if command -v timeout >/dev/null 2>&1; then tm="timeout ${CAPTURE_META_KILL_SEC}"; tf="timeout ${CAPTURE_FRAME_KILL_SEC}"; else tm=""; tf=""; fi
if command -v xprop >/dev/null 2>&1; then
  aw=$($tm xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | sed 's/.*# //;s/,.*//' | tr -d ' ')
  if [ -n "$aw" ] && [ "$aw" != "0x0" ]; then
    $tm xprop -id "$aw" _NET_WM_NAME 2>/dev/null | sed 's/^/T /'
    $tm xprop -id "$aw" WM_CLASS 2>/dev/null | sed 's/^/C /'
  fi
else
  echo "D xprop"
fi
if command -v wmctrl >/dev/null 2>&1; then
  echo "W $($tm wmctrl -l 2>/dev/null | wc -l | tr -d ' ')"
else
  echo "D wmctrl"
fi
command -v ffmpeg >/dev/null 2>&1 || echo "D ffmpeg"
echo ${nonce}
if command -v ffmpeg >/dev/null 2>&1; then
  $tf ffmpeg -loglevel error -f x11grab -draw_mouse 1 -i :1 -frames:v 1 -vf scale=${width}:-2 -f image2 -vcodec libwebp -quality 55 -
fi
`;

  const exec = await docker.getContainer(idOrName).exec({
    Cmd: ['/bin/sh', '-c', script],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = (await exec.start({ hijack: true, stdin: false })) as Duplex;
  const { stdout, truncated, timedOut } = await readExecStdout(stream, MAX_CAPTURE_BYTES, CAPTURE_TIMEOUT_MS);

  const marker = Buffer.from(`${nonce}\n`);
  const split = stdout.indexOf(marker);
  const header = (split < 0 ? stdout : stdout.subarray(0, split)).toString('utf8');
  const image = split < 0 ? Buffer.alloc(0) : stdout.subarray(split + marker.length);

  const sample: ObservationCapture = {};
  const degraded: string[] = [];
  for (const line of header.split('\n')) {
    if (line.startsWith('T ')) {
      const title = xpropValue(line.slice(2));
      if (title) sample.title = title.slice(0, 512);
    } else if (line.startsWith('C ')) {
      const appClass = xpropValue(line.slice(2));
      if (appClass) sample.appClass = appClass.slice(0, 256);
    } else if (line.startsWith('W ')) {
      const count = Number(line.slice(2).trim());
      if (Number.isFinite(count)) sample.windowCount = Math.min(9999, Math.max(0, Math.round(count)));
    } else if (line.startsWith('D ')) {
      degraded.push(`missing:${line.slice(2).trim()}`);
    }
  }

  if (timedOut) degraded.push('timeout');
  if (truncated || image.length > MAX_IMAGE_BYTES) {
    // Half a frame is a broken image, but the metadata is still worth sending.
    degraded.push('image-too-large');
  } else if (image.length) {
    sample.image = image.toString('base64');
    const size = webpDimensions(image);
    sample.imageWidth = size?.width ?? width;
    if (size) sample.imageHeight = size.height;
  } else if (!timedOut && !degraded.includes('missing:ffmpeg')) {
    degraded.push('no-image');
  }
  // Tokens, not prose: the wall maps them onto its own translated reasons.
  if (degraded.length) sample.degraded = degraded.join(',').slice(0, 256);
  return sample;
}

/** Even width within the contract's bounds; `-2` leaves the height to the aspect ratio. */
function clampThumbWidth(width?: number): number {
  const requested = width !== undefined && Number.isFinite(width) ? Math.round(width) : 320;
  const bounded = Math.min(640, Math.max(160, requested));
  return bounded - (bounded % 2);
}

/**
 * Value out of one xprop line — `_NET_WM_NAME(UTF8_STRING) = "New Tab - Google
 * Chrome"`. WM_CLASS carries two and the instance name comes first. A property
 * that is not set prints `_NET_WM_NAME:  not found.` and has no ` = ` at all,
 * which is the normal case for a desktop with nothing focused.
 */
function xpropValue(line: string): string | undefined {
  const at = line.indexOf(' = ');
  if (at < 0) return undefined;
  const raw = line.slice(at + 3).trim();
  const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(raw);
  const value = quoted ? (quoted[1] ?? '').replace(/\\(.)/g, '$1') : raw;
  return value.length ? value : undefined;
}

/**
 * Pixel size out of the WebP header. `scale=<w>:-2` takes the height from the
 * source aspect ratio, so this is the only place the agent can learn it — and
 * the wall needs it to reserve the tile before the frame paints.
 */
function webpDimensions(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 30) return undefined;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return undefined;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    // Lossy frame: 3-byte tag, the 0x9d012a start code, then two 14-bit values.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return undefined;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  return undefined;
}

/**
 * Read an ATTACHED exec to completion. Docker frames stdout and stderr into
 * 8-byte-headed chunks whenever the exec has no TTY — and a TTY is no option
 * here, its newline translation would corrupt the WebP — so the frames are
 * reassembled by hand rather than through modem.demuxStream: the read has to
 * abort mid-stream on the cap and on the deadline, and a single frame can
 * arrive split across several chunks.
 */
function readExecStdout(
  stream: Duplex,
  capBytes: number,
  timeoutMs: number,
): Promise<{ stdout: Buffer; truncated: boolean; timedOut: boolean }> {
  return new Promise((resolve) => {
    const frames: Buffer[] = [];
    let pending: Buffer = Buffer.alloc(0);
    let collected = 0;
    let truncated = false;
    let timedOut = false;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(frames), truncated, timedOut });
    };
    const abort = () => {
      stream.destroy();
      finish();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeoutMs);

    stream.on('data', (chunk: Buffer) => {
      if (done) return;
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      for (;;) {
        if (pending.length < 8) return;
        const length = pending.readUInt32BE(4);
        if (pending.length < 8 + length) return;
        const isStdout = pending[0] === 1;
        const payload = pending.subarray(8, 8 + length);
        pending = pending.subarray(8 + length);
        if (!isStdout) continue;
        frames.push(payload);
        collected += payload.length;
        if (collected > capBytes) {
          truncated = true;
          abort();
          return;
        }
      }
    });
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
  });
}

/**
 * Start a best-effort recorder sidecar that shares the session container's network
 * namespace and writes to the recordings dir. Pluggable via ASHA_RECORDER_IMAGE;
 * when unset this is a no-op (the manager still tracks the Recording row, so a
 * recorder image can be wired in later without app changes).
 */
export async function startRecorder(
  sessionContainerId: string,
  sessionId: string,
  recordingId: string,
): Promise<void> {
  const image = process.env.ASHA_RECORDER_IMAGE;
  if (!image) return;
  try {
    const out = join(RECORDING_DIR, recordingId);
    mkdirSync(out, { recursive: true });
    const c = await docker.createContainer({
      Image: image,
      name: `asha-rec-${sessionId}`,
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
    const c = docker.getContainer(`asha-rec-${sessionId}`);
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
