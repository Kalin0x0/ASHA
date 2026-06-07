/**
 * Typed Redis pub/sub channels and message shapes shared by the manager, the
 * agent, and the connection proxy. Keeping the wire format here prevents drift
 * between the producers and consumers of every cross-process message.
 */

export const RedisChannels = {
  /** Manager → agents in a zone: provision a session. */
  provision: (zone: string) => `chista:zone:${zone}:provision`,
  /** Manager → agents in a zone: destroy a session. */
  destroy: (zone: string) => `chista:zone:${zone}:destroy`,
  /** Manager → agents in a zone: pause/resume/control an existing session. */
  control: (zone: string) => `chista:zone:${zone}:control`,
  /** Agent → manager: lifecycle/status updates. */
  agentStatus: 'chista:agent:status',
  /** Agent → manager: batched resource stats. */
  agentStats: 'chista:agent:stats',
  /** Manager fan-out to an org's connected dashboards. */
  orgSessions: (orgId: string) => `chista:org:${orgId}:sessions`,
  /** Session-share chat/control fan-out. */
  share: (shareId: string) => `chista:share:${shareId}`,
} as const;

/**
 * Hardware GPU encoding for the session stream. Open-source encoders only:
 *   • nvenc — NVIDIA NVENC via the nvidia-container-runtime (NVIDIA_VISIBLE_DEVICES).
 *   • vaapi — Intel/AMD VAAPI via the /dev/dri render node.
 * `none` (default) means software x264 encoding inside the image.
 */
export interface GpuConfig {
  count?: number;
  encoder?: 'none' | 'nvenc' | 'vaapi';
  /** Host DRI render node for VAAPI, e.g. "/dev/dri/renderD128". */
  renderDevice?: string;
}

export interface RunConfig {
  dockerImage: string;
  env: Record<string, string>;
  ports: number[];
  shmSize?: string;
  cores?: number;
  memLimitMb?: number;
  gpuCount?: number;
  /** Hardware H.264 encoding configuration (NVENC / VAAPI). */
  gpu?: GpuConfig;
  volumes?: Array<{ source: string; target: string; readOnly?: boolean }>;
  /**
   * Host device paths to pass through into the container.
   * Examples: "/dev/video0" (webcam), "/dev/bus/usb" (USB), "/dev/pcsc" (smartcard).
   * Docker maps these 1:1; Kubernetes mounts them as CharDevice hostPath volumes.
   */
  devices?: string[];
  /** Extra Linux capabilities to add / drop on the session container. */
  capAdd?: string[];
  capDrop?: string[];
  /** Security options, e.g. "seccomp=unconfined" or "apparmor=<profile>". */
  securityOpt?: string[];
  /** Run privileged (admin-gated; avoid unless a workspace truly needs it). */
  privileged?: boolean;
  /** Extra container labels (token-interpolated). System/Traefik labels win. */
  labels?: Record<string, string>;
  /** Container restart policy. Defaults to "no". */
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
}

/**
 * Data-Loss-Prevention policy enforced at the session boundary. Each flag is a
 * capability the user is *allowed* to use; a missing/false flag disables it.
 * The agent injects these as container env vars (KasmVNC/Neko honour them) and
 * the viewer reads them back to grey out the matching toolbar controls.
 */
export interface DlpPolicy {
  /** Host → session paste. */
  clipboardUp?: boolean;
  /** Session → host copy. */
  clipboardDown?: boolean;
  /** File upload into the session. */
  uploads?: boolean;
  /** File download out of the session. */
  downloads?: boolean;
  /** Virtual printing (CUPS → PDF → download). */
  printing?: boolean;
  /** Microphone passthrough. */
  audioIn?: boolean;
  /** Speaker/audio-out passthrough. */
  audioOut?: boolean;
  /** Install-as-PWA / open-in-new-tab. */
  pwa?: boolean;
  /** Forensic watermark overlaid on the stream (exfil deterrence). */
  watermark?: { text?: string; opacity?: number; tile?: boolean };
  /** Max bytes per clipboard transfer (0 disables clipboard). */
  clipboardMaxBytes?: number;
  /** Allowed clipboard MIME types (empty ⇒ text/plain only). */
  clipboardAllowMimeTypes?: string[];
  /** Max keyboard events per second (anti-automation / scripted exfil). */
  keyboardRateLimit?: number;
  /** Purge in-session memory if the DLP enforcement process dies (fail-secure). */
  failSecure?: boolean;
}

/**
 * A sidecar container that the agent launches alongside the session container.
 * All sidecars share the session's Docker network (or Pod network in K8s).
 */
export interface SessionSidecar {
  /** Docker/OCI image to run. */
  image: string;
  /** Environment variables. */
  env?: Record<string, string>;
  /** Config files to inject: mountPath → file content. */
  configs?: Record<string, string>;
  /** Linux capabilities to add (e.g. NET_ADMIN for WireGuard). */
  capAdd?: string[];
  /** Container ports (informational; used for K8s containerPort spec). */
  ports?: number[];
}

export interface ProvisionCommand {
  sessionId: string;
  kasmId: string;
  orgId: string;
  workspaceId: string;
  zone: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH' | 'WEBRTC';
  runConfig: RunConfig;
  /** Data-loss-prevention policy applied to the session container. */
  dlp?: DlpPolicy;
  /** Open-source sidecars to co-launch with the session container. */
  sidecars?: {
    /** Squid (squid-cache.org) web-filter proxy sidecar. */
    squid?: SessionSidecar;
    /** WireGuard (wireguard.com) egress tunnel sidecar. */
    wireguard?: SessionSidecar;
    /** Neko (github.com/m1k1o/neko) isolated-browser sidecar. */
    neko?: SessionSidecar;
    /** PulseAudio-over-WebSocket audio bridge sidecar. */
    audio?: SessionSidecar;
    /** CUPS virtual-printer → PDF sidecar. */
    printing?: SessionSidecar;
  };
}

export interface DestroyCommand {
  sessionId: string;
  containerId?: string;
  reason?: string;
  preserveVolumes?: boolean;
}

/**
 * Manager → agent control message for an already-running session. `resize`
 * carries new screen geometry; pause/resume freeze/thaw the container.
 */
export interface SessionControlCommand {
  sessionId: string;
  containerId?: string;
  action: 'PAUSE' | 'RESUME' | 'RESIZE';
  /** For RESIZE. */
  width?: number;
  height?: number;
}

export type SessionLifecycleStatus =
  | 'PROVISIONING'
  | 'RUNNING'
  | 'DEGRADED'
  | 'PAUSED'
  | 'DESTROYED'
  | 'ERROR';

export interface SessionStatusUpdate {
  sessionId: string;
  status: SessionLifecycleStatus;
  containerId?: string;
  internalHost?: string;
  host?: string;
  port?: number;
  traefikRouterName?: string;
  error?: string;
}

export interface SessionStatSample {
  sessionId: string;
  cpuPct: number;
  memMb: number;
  netRxKb?: number;
  netTxKb?: number;
}

export interface AgentHeartbeat {
  agentId: string;
  cpuCores: number;
  memTotalMb: number;
  memFreeMb: number;
  loadPercent: number;
  currentSessions: number;
  version: string;
}

export interface ShareChatEvent {
  shareId: string;
  sessionId: string;
  messageId: string;
  authorName: string;
  body: string;
  at: string;
}

export interface ShareParticipantEvent {
  shareId: string;
  sessionId: string;
  participantId: string;
  name: string;
  joined: boolean;
}

/** Realtime events pushed to dashboards over the WebSocket gateway. */
export type WsServerEvent =
  | { type: 'session.status'; payload: SessionStatusUpdate }
  | { type: 'session.stats'; payload: SessionStatSample }
  | { type: 'session.ready'; payload: { sessionId: string; connectionUrl: string } }
  | { type: 'agent.health'; payload: AgentHeartbeat & { status: string } }
  | { type: 'alert.new'; payload: { level: 'info' | 'warn' | 'error'; message: string } }
  | { type: 'share.chat'; payload: ShareChatEvent }
  | { type: 'share.participant'; payload: ShareParticipantEvent };
