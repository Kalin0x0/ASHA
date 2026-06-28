/**
 * Kubernetes session driver — ephemeral Pod + ClusterIP Service per session.
 *
 * The agent must run with a ServiceAccount that has the following RBAC verbs
 * in the session namespace (see infra/helm/asha/templates/agent-rbac.yaml):
 *   - pods:            create, get, delete, list
 *   - services:        create, delete
 *   - ingresses:       create, delete
 *   - pods/log:        get  (for stats / readiness)
 *
 * Interface mirrors docker.ts: callers can switch drivers without changing
 * the provisioning loop in index.ts.
 */
import { KubeConfig, CoreV1Api, NetworkingV1Api, AppsV1Api, Metrics } from '@kubernetes/client-node';
import type { V1ConfigMap, V1Container, V1Pod, V1Service, V1Ingress, V1Volume } from '@kubernetes/client-node';
import type { ProvisionCommand, SessionSidecar, SessionStatSample, StreamProfile } from '@asha/events';
import { routerName } from '@asha/proxy-labels';
import { agentEnv } from './env.js';

// ── Kubernetes client setup ──────────────────────────────────────────────────

function buildKubeClients() {
  const kc = new KubeConfig();
  // In-cluster config when running as a Pod; falls back to ~/.kube/config in dev.
  kc.loadFromDefault();
  return {
    core: kc.makeApiClient(CoreV1Api),
    networking: kc.makeApiClient(NetworkingV1Api),
    apps: kc.makeApiClient(AppsV1Api),
    metrics: new Metrics(kc),
    kc,
  };
}

let _clients: ReturnType<typeof buildKubeClients> | null = null;
function clients() {
  if (!_clients) _clients = buildKubeClients();
  return _clients;
}

const SESSION_NS = process.env.ASHA_K8S_SESSION_NS ?? 'asha-sessions';
const INGRESS_CLASS = process.env.ASHA_K8S_INGRESS_CLASS ?? 'traefik';
const INGRESS_HOST = process.env.ASHA_K8S_INGRESS_HOST ?? agentEnv.domain;

// ── Public interface (same shape as docker.ts) ───────────────────────────────

export interface ProvisionResult {
  containerId: string; // pod name (used as the "container id" key in maps)
  internalHost: string; // ClusterIP service name (DNS-resolvable in the cluster)
  port: number;
  routerName: string;
}

export async function provisionContainer(cmd: ProvisionCommand): Promise<ProvisionResult> {
  const { core, networking } = clients();
  const name = `asha-sess-${cmd.kasmId}`.toLowerCase().slice(0, 63);
  const port = cmd.runConfig.ports[0] ?? 6901;
  const router = routerName(cmd.kasmId);
  const vncPw = randomSuffix();

  const labels = {
    'app.kubernetes.io/managed-by': 'asha',
    'asha.io/session-id': cmd.sessionId,
    'asha.io/org-id': cmd.orgId,
    'asha.io/kasm-id': cmd.kasmId,
  };

  // Build sidecar containers + shared volumes from connectivity policy.
  const { sidecarContainers, sidecarVolumes, configMap } = buildSidecars(cmd, name);
  const cmName = `${name}-cfg`;

  // Everything from the first resource creation through readiness is wrapped so
  // a failure (notably a waitForPodRunning timeout) tears down the Pod, Service,
  // Ingress and ConfigMap instead of orphaning them — the manager never learns
  // the name to call destroyContainer otherwise.
  try {
  if (configMap && Object.keys(configMap).length > 0) {
    const cm: V1ConfigMap = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: cmName, namespace: SESSION_NS, labels },
      data: configMap,
    };
    await core.createNamespacedConfigMap({ namespace: SESSION_NS, body: cm });
  }

  // 1. Pod
  const pod: V1Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name, namespace: SESSION_NS, labels },
    spec: {
      restartPolicy: 'Never',
      automountServiceAccountToken: false,
      containers: [
        {
          name: 'session',
          image: cmd.runConfig.dockerImage,
          ports: [{ containerPort: port }],
          env: [
            { name: 'VNC_PW', value: vncPw },
            ...Object.entries({ ...gpuEnv(cmd), ...cmd.runConfig.env }).map(([n, v]) => ({ name: n, value: v })),
          ],
          resources: {
            requests: {
              ...(cmd.runConfig.cores ? { cpu: `${cmd.runConfig.cores}` } : {}),
              ...(cmd.runConfig.memLimitMb ? { memory: `${cmd.runConfig.memLimitMb}Mi` } : {}),
            },
            limits: {
              ...(cmd.runConfig.cores ? { cpu: `${cmd.runConfig.cores}` } : {}),
              ...(cmd.runConfig.memLimitMb ? { memory: `${cmd.runConfig.memLimitMb}Mi` } : {}),
              // NVENC requests a GPU from the NVIDIA device plugin.
              ...(cmd.runConfig.gpu?.encoder === 'nvenc'
                ? { 'nvidia.com/gpu': `${cmd.runConfig.gpu.count ?? 1}` }
                : {}),
            },
          },
          volumeMounts: [
            ...(cmd.runConfig.volumes ?? []).map((v, i) => ({
              name: `vol-${i}`,
              mountPath: v.target,
              readOnly: v.readOnly,
            })),
            // Device passthrough: each host device is mounted via a hostPath volume.
            // VAAPI adds the DRI render node for hardware H.264 encoding.
            ...gpuDevices(cmd).map((devPath, i) => ({
              name: `dev-${i}`,
              mountPath: devPath,
            })),
          ],
          // Devices need the container to run with device access capabilities.
          ...(gpuDevices(cmd).length
            ? { securityContext: { capabilities: { add: ['MKNOD', 'SYS_RAWIO'] } } }
            : {}),
        },
        ...sidecarContainers,
      ],
      volumes: [
        ...(cmd.runConfig.volumes ?? []).map((v, i) => ({
          name: `vol-${i}`,
          hostPath: { path: v.source },
        })),
        // One hostPath CharDevice volume per requested device (incl. VAAPI render node).
        ...gpuDevices(cmd).map((devPath, i) => ({
          name: `dev-${i}`,
          hostPath: { path: devPath, type: 'CharDevice' as const },
        })),
        ...sidecarVolumes,
      ],
    },
  };
  await core.createNamespacedPod({ namespace: SESSION_NS, body: pod });

  // 2. ClusterIP Service — lets the ingress (and other in-cluster services) reach the pod
  const svc: V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, namespace: SESSION_NS, labels },
    spec: {
      selector: { 'asha.io/kasm-id': cmd.kasmId },
      ports: [{ port, targetPort: port }],
    },
  };
  await core.createNamespacedService({ namespace: SESSION_NS, body: svc });

  // 3. Ingress — path /kasm/<kasmId>/ → Service
  const ingress: V1Ingress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name,
      namespace: SESSION_NS,
      labels,
      annotations: {
        'kubernetes.io/ingress.class': INGRESS_CLASS,
        // Strip the /kasm/<id> prefix before forwarding
        'traefik.ingress.kubernetes.io/router.middlewares': `${SESSION_NS}-strip-kasm-prefix@kubernetescrd`,
      },
    },
    spec: {
      ingressClassName: INGRESS_CLASS,
      rules: [
        {
          host: INGRESS_HOST,
          http: {
            paths: [
              {
                path: `/kasm/${cmd.kasmId}`,
                pathType: 'Prefix',
                backend: {
                  service: { name, port: { number: port } },
                },
              },
            ],
          },
        },
      ],
    },
  };
  await networking.createNamespacedIngress({ namespace: SESSION_NS, body: ingress });

  // 4. Wait for the Pod to become Running (max 60 s)
  await waitForPodRunning(name, 60_000);

  const internalHost = `${name}.${SESSION_NS}.svc.cluster.local`;
  return { containerId: name, internalHost, port, routerName: router };
  } catch (e) {
    await destroyContainer(name).catch(() => undefined);
    throw e;
  }
}

export async function destroyContainer(podName: string): Promise<void> {
  const { core, networking } = clients();
  const opts = { namespace: SESSION_NS };
  await Promise.allSettled([
    core.deleteNamespacedPod({ name: podName, ...opts }),
    core.deleteNamespacedService({ name: podName, ...opts }),
    networking.deleteNamespacedIngress({ name: podName, ...opts }),
    // ConfigMap created for sidecar configs (may not exist — allSettled swallows the 404).
    core.deleteNamespacedConfigMap({ name: `${podName}-cfg`, ...opts }),
  ]);
}

/** Collect CPU/memory stats for running session pods via the Metrics API. */
export async function collectStats(map: Map<string, string>): Promise<SessionStatSample[]> {
  if (map.size === 0) return [];
  try {
    const podMetrics = await clients().metrics.getPodMetrics(SESSION_NS);
    const samples: SessionStatSample[] = [];
    for (const podMet of podMetrics.items) {
      const podName = podMet.metadata?.name ?? '';
      const sessionId = map.get(podName);
      if (!sessionId) continue;
      const container = podMet.containers?.[0];
      if (!container) continue;
      const cpuNano = parseCpuNano(container.usage.cpu ?? '0');
      const memMib = parseMemMiB(container.usage.memory ?? '0');
      samples.push({ sessionId, cpuPct: Math.round((cpuNano / 1e9) * 100) / 100, memMb: memMib });
    }
    return samples;
  } catch {
    // Metrics server not available or RBAC not yet granted — return empty.
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts ProvisionCommand sidecar descriptors into K8s container specs,
 * a shared ConfigMap data blob, and the Volume references needed to mount them.
 *
 * All sidecars run in the same Pod as the session container, so they share
 * localhost — Squid is reachable at localhost:3128, etc.
 */
function buildSidecars(
  cmd: ProvisionCommand,
  podName: string,
): { sidecarContainers: V1Container[]; sidecarVolumes: V1Volume[]; configMap: Record<string, string> } {
  const sidecarContainers: V1Container[] = [];
  const sidecarVolumes: V1Volume[] = [];
  const configMap: Record<string, string> = {};

  const sidecars: Array<{ key: string; spec: SessionSidecar }> = [
    ...(cmd.sidecars?.squid ? [{ key: 'squid', spec: cmd.sidecars.squid }] : []),
    ...(cmd.sidecars?.wireguard ? [{ key: 'wireguard', spec: cmd.sidecars.wireguard }] : []),
    ...(cmd.sidecars?.neko ? [{ key: 'neko', spec: cmd.sidecars.neko }] : []),
    ...(cmd.sidecars?.audio ? [{ key: 'audio', spec: cmd.sidecars.audio }] : []),
    ...(cmd.sidecars?.printing ? [{ key: 'printing', spec: cmd.sidecars.printing }] : []),
  ];

  for (const { key, spec } of sidecars) {
    const volumeMounts: V1Container['volumeMounts'] = [];

    for (const [mountPath, content] of Object.entries(spec.configs ?? {})) {
      // ConfigMap key: replace / with _ to create a valid DNS label.
      const cmKey = `${key}-${mountPath.replace(/\//g, '_')}`;
      configMap[cmKey] = content;

      const volName = `cfg-${key}-${volumeMounts.length}`;
      sidecarVolumes.push({
        name: volName,
        configMap: {
          name: `${podName}-cfg`,
          items: [{ key: cmKey, path: mountPath.split('/').pop()! }],
        },
      });
      volumeMounts.push({ name: volName, mountPath, readOnly: true });
    }

    sidecarContainers.push({
      name: key,
      image: spec.image,
      env: Object.entries(spec.env ?? {}).map(([n, v]) => ({ name: n, value: v })),
      ports: (spec.ports ?? []).map((p) => ({ containerPort: p })),
      securityContext: spec.capAdd?.length
        ? { capabilities: { add: spec.capAdd } }
        : undefined,
      volumeMounts: volumeMounts.length ? volumeMounts : undefined,
    });
  }

  return { sidecarContainers, sidecarVolumes, configMap };
}

/**
 * Kubernetes has no native pod-freeze primitive, so pause/resume are best-effort
 * no-ops in the K8s driver (the session keeps running; the viewer simply detaches).
 * Exposed to keep the driver interface identical to docker.ts.
 */
export async function pauseContainer(_podName: string): Promise<void> {
  // No-op: see note above. The manager still records PAUSED for UI parity.
}

export async function unpauseContainer(_podName: string): Promise<void> {
  // No-op: counterpart of pauseContainer.
}

/** Geometry is negotiated client-side for K8s sessions; this is a no-op. */
export async function resizeContainer(_podName: string, _w: number, _h: number): Promise<void> {
  // No-op.
}

/** Stream control is negotiated client-side for K8s sessions; this is a no-op. */
export async function applyStreamProfile(_podName: string, _profile: StreamProfile): Promise<void> {
  // No-op.
}

/** Recording is handled by a manager-side pipeline for K8s sessions; no-op here. */
export async function startRecorder(_containerId: string, _sessionId: string, _recordingId: string): Promise<void> {
  // No-op.
}

/** Counterpart of startRecorder. */
export async function stopRecorder(_sessionId: string): Promise<void> {
  // No-op.
}

/**
 * Image caching is owned by each node's kubelet in the K8s driver, so the agent
 * cannot reclaim host disk centrally — these are no-ops kept for interface parity
 * with docker.ts (the manager still records the registry-level remove/reinstall).
 */
export async function removeImage(
  _image: string,
  _opts: { prune?: boolean } = {},
): Promise<{ removed: boolean; freedBytes: number }> {
  return { removed: false, freedBytes: 0 };
}

export async function pullImage(_image: string): Promise<void> {
  // No-op: the kubelet pulls images on pod scheduling per imagePullPolicy.
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
  return { ASHA_HW_ENCODER: 'vaapi', LIBVA_DRIVER_NAME: 'iHD' };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function waitForPodRunning(name: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const { core } = clients();
  while (Date.now() < deadline) {
    const { phase } = (await core.readNamespacedPod({ name, namespace: SESSION_NS })).status ?? {};
    if (phase === 'Running') return;
    if (phase === 'Failed' || phase === 'Succeeded') throw new Error(`Pod ${name} ended in phase ${phase}`);
    await sleep(1000);
  }
  throw new Error(`Pod ${name} did not become Running within ${timeoutMs}ms`);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Parse k8s CPU string (e.g. "125m" → nanoCPUs). */
function parseCpuNano(cpu: string): number {
  if (cpu.endsWith('m')) return Number(cpu.slice(0, -1)) * 1_000_000;
  if (cpu.endsWith('n')) return Number(cpu.slice(0, -1));
  return Number(cpu) * 1_000_000_000;
}

/** Parse k8s memory string (e.g. "256Mi") → MiB. */
function parseMemMiB(mem: string): number {
  if (mem.endsWith('Ki')) return Math.round(Number(mem.slice(0, -2)) / 1024);
  if (mem.endsWith('Mi')) return Number(mem.slice(0, -2));
  if (mem.endsWith('Gi')) return Math.round(Number(mem.slice(0, -2)) * 1024);
  return Math.round(Number(mem) / (1024 * 1024));
}
