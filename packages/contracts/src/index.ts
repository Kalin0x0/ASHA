import { z } from 'zod';

// ── Auth ─────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  totp: z.string().optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshDto = z.infer<typeof refreshSchema>;

export const confirmTotpSchema = z.object({
  methodId: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/),
});
export type ConfirmTotpDto = z.infer<typeof confirmTotpSchema>;

export const verifyTotpSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
});
export type VerifyTotpDto = z.infer<typeof verifyTotpSchema>;

// ── Sessions ─────────────────────────────────────────────────────────────────
export const createSessionSchema = z.object({
  workspaceId: z.string().min(1),
  zoneId: z.string().optional(),
  launchValues: z.record(z.unknown()).optional(),
});
export type CreateSessionDto = z.infer<typeof createSessionSchema>;

// ── Workspaces ───────────────────────────────────────────────────────────────
// Data-loss-prevention policy. Each flag grants a capability; absent = denied.
export const dlpPolicySchema = z.object({
  clipboardUp: z.boolean().optional(),
  clipboardDown: z.boolean().optional(),
  uploads: z.boolean().optional(),
  downloads: z.boolean().optional(),
  printing: z.boolean().optional(),
  audioIn: z.boolean().optional(),
  audioOut: z.boolean().optional(),
  pwa: z.boolean().optional(),
  // Geometric / advanced DLP — honoured by DLP-capable KasmVNC images
  // (CHISTA_DLP_ENABLED, see infra/workstation). Propagated as KASM_DLP_* env.
  watermark: z
    .object({
      text: z.string().max(120).optional(),
      opacity: z.number().min(0).max(1).optional(),
      tile: z.boolean().optional(),
    })
    .optional(),
  clipboardMaxBytes: z.number().int().min(0).optional(),
  clipboardAllowMimeTypes: z.array(z.string().max(120)).max(20).optional(),
  keyboardRateLimit: z.number().int().min(0).optional(),
  failSecure: z.boolean().optional(),
});
export type DlpPolicyDto = z.infer<typeof dlpPolicySchema>;

// Live in-session stream control (resolution / fps / quality / bitrate / clipboard).
export const streamProfileSchema = z.object({
  resolution: z
    .object({ width: z.number().int().min(320).max(7680), height: z.number().int().min(240).max(4320) })
    .optional(),
  maxFps: z.number().int().min(1).max(120).optional(),
  quality: z.enum(['low', 'medium', 'high', 'lossless']).optional(),
  jpegQuality: z.number().int().min(0).max(100).optional(),
  webpQuality: z.number().int().min(0).max(100).optional(),
  maxBitrateKbps: z.number().int().min(0).max(1_000_000).optional(),
  clipboardSync: z.boolean().optional(),
  // B2: max monitors the viewer may open for this session (multi-monitor).
  maxDisplays: z.number().int().min(1).max(8).optional(),
});
export type StreamProfileDto = z.infer<typeof streamProfileSchema>;

// Hardware H.264 encoding (NVENC/VAAPI). Open-source encoders only.
export const gpuConfigSchema = z.object({
  count: z.number().int().min(0).optional(),
  encoder: z.enum(['none', 'nvenc', 'vaapi']).optional(),
  renderDevice: z.string().optional(),
});
export type GpuConfigDto = z.infer<typeof gpuConfigSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  friendlyName: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['CONTAINER', 'SERVER', 'REMOTE_APP', 'VM', 'LINK']).default('CONTAINER'),
  imageId: z.string().optional(),
  // Convenience: when no imageId is given but a dockerImage is, the manager
  // creates+links a backing Image so the workspace is launchable immediately.
  dockerImage: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  // Non-container placement: SERVER/VM/REMOTE_APP bind to a registered Server;
  // an optional preferred deployment Zone applies to any type.
  serverId: z.string().optional(),
  zoneId: z.string().optional(),
  categories: z.array(z.string()).default([]),
  coresLimit: z.number().optional(),
  memLimitMb: z.number().optional(),
  gpuCount: z.number().int().min(0).default(0),
  gpu: gpuConfigSchema.optional(),
  dlp: dlpPolicySchema.optional(),
  dockerConfig: z.record(z.unknown()).default({}),
});
export type CreateWorkspaceDto = z.infer<typeof createWorkspaceSchema>;

// Partial update: every field optional, no defaults injected, plus an `enabled`
// toggle. At least one field must be present so a no-op PATCH is rejected.
export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1),
    friendlyName: z.string().min(1),
    description: z.string(),
    type: z.enum(['CONTAINER', 'SERVER', 'REMOTE_APP', 'VM', 'LINK']),
    imageId: z.string(),
    serverId: z.string().nullable(),
    zoneId: z.string().nullable(),
    categories: z.array(z.string()),
    coresLimit: z.number(),
    memLimitMb: z.number(),
    gpuCount: z.number().int().min(0),
    gpu: gpuConfigSchema,
    dlp: dlpPolicySchema,
    dockerConfig: z.record(z.unknown()),
    enabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateWorkspaceDto = z.infer<typeof updateWorkspaceSchema>;

// ── Storage: volume mappings ─────────────────────────────────────────────────
export const createVolumeMappingSchema = z.object({
  name: z.string().min(1),
  hostPath: z.string().min(1),
  destPath: z.string().min(1),
  readOnly: z.boolean().default(false),
  raw: z.record(z.unknown()).default({}),
});
export type CreateVolumeMappingDto = z.infer<typeof createVolumeMappingSchema>;

// Network / object storage mounts (S3, NextCloud, GDrive, …) attached to sessions.
export const createStorageMappingSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(['DROPBOX', 'GDRIVE', 'NEXTCLOUD', 'ONEDRIVE', 'S3', 'CUSTOM']),
  mountPath: z.string().min(1).max(400),
  readOnly: z.boolean().default(false),
  scope: z.enum(['USER', 'GROUP', 'WORKSPACE']).default('GROUP'),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type CreateStorageMappingDto = z.infer<typeof createStorageMappingSchema>;

export const updateStorageMappingSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    mountPath: z.string().min(1).max(400).optional(),
    readOnly: z.boolean().optional(),
    scope: z.enum(['USER', 'GROUP', 'WORKSPACE']).optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateStorageMappingDto = z.infer<typeof updateStorageMappingSchema>;

export const updateVolumeMappingSchema = z
  .object({
    name: z.string().min(1),
    hostPath: z.string().min(1),
    destPath: z.string().min(1),
    readOnly: z.boolean(),
    raw: z.record(z.unknown()),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateVolumeMappingDto = z.infer<typeof updateVolumeMappingSchema>;

// ── Storage: file mappings ───────────────────────────────────────────────────
export const createFileMappingSchema = z.object({
  name: z.string().min(1),
  target: z.enum(['CONTAINER', 'WINDOWS']).default('CONTAINER'),
  sourcePath: z.string().min(1),
  destPath: z.string().min(1),
  owner: z.string().optional(),
  group: z.string().optional(),
  mode: z
    .string()
    .regex(/^[0-7]{3,4}$/, 'Mode must be octal, e.g. 0644')
    .optional(),
  isHomeProfile: z.boolean().default(false),
  scope: z.enum(['USER', 'GROUP', 'WORKSPACE']).default('WORKSPACE'),
  userId: z.string().optional(),
});
export type CreateFileMappingDto = z.infer<typeof createFileMappingSchema>;

export const updateFileMappingSchema = z
  .object({
    name: z.string().min(1),
    target: z.enum(['CONTAINER', 'WINDOWS']),
    sourcePath: z.string().min(1),
    destPath: z.string().min(1),
    owner: z.string(),
    group: z.string(),
    mode: z.string().regex(/^[0-7]{3,4}$/, 'Mode must be octal, e.g. 0644'),
    isHomeProfile: z.boolean(),
    scope: z.enum(['USER', 'GROUP', 'WORKSPACE']),
    userId: z.string(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateFileMappingDto = z.infer<typeof updateFileMappingSchema>;

// ── Storage: persistent profiles ─────────────────────────────────────────────
export const createPersistentProfileSchema = z.object({
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
  volumeName: z.string().min(1),
  backend: z.enum(['DOCKER_VOLUME', 'S3']).default('DOCKER_VOLUME'),
  sizeLimitMb: z.number().int().positive().optional(),
});
export type CreatePersistentProfileDto = z.infer<typeof createPersistentProfileSchema>;

// ── Session sharing ──────────────────────────────────────────────────────────
export const createShareSchema = z.object({
  allowControl: z.boolean().default(false),
  requireAuth: z.boolean().default(true),
  enableChat: z.boolean().default(true),
  enableAv: z.boolean().default(false),
  /** Minutes until the share link expires; omit for no expiry. */
  expiresInMinutes: z.number().int().positive().max(10080).optional(),
});
export type CreateShareDto = z.infer<typeof createShareSchema>;

export const postChatMessageSchema = z.object({
  body: z.string().min(1).max(2000),
  authorName: z.string().min(1).max(120).optional(),
});
export type PostChatMessageDto = z.infer<typeof postChatMessageSchema>;

export const joinShareSchema = z.object({
  guestName: z.string().min(1).max(120).optional(),
});
export type JoinShareDto = z.infer<typeof joinShareSchema>;

// ── Agent (internal) ─────────────────────────────────────────────────────────
export const agentRegisterSchema = z.object({
  enrollmentToken: z.string().min(1),
  hostname: z.string().min(1),
  zone: z.string().min(1),
  cpuCores: z.number().int().min(1),
  memTotalMb: z.number().int().min(1),
  version: z.string().default('0.1.0'),
});
export type AgentRegisterDto = z.infer<typeof agentRegisterSchema>;

export const agentHeartbeatSchema = z.object({
  cpuCores: z.number(),
  memTotalMb: z.number(),
  memFreeMb: z.number(),
  loadPercent: z.number(),
  currentSessions: z.number().int(),
  version: z.string(),
});
export type AgentHeartbeatDto = z.infer<typeof agentHeartbeatSchema>;

export const sessionStatusSchema = z.object({
  status: z.enum(['PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED', 'DESTROYED', 'ERROR']),
  containerId: z.string().optional(),
  internalHost: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  traefikRouterName: z.string().optional(),
  error: z.string().optional(),
  // Protocol credentials the agent injects into the container at launch, passed
  // through to the connection-proxy session record (RDP/VNC/SSH bridging).
  sshUser: z.string().optional(),
  sshPassword: z.string().optional(),
  sshPrivateKey: z.string().optional(),
  rdpUser: z.string().optional(),
  rdpPassword: z.string().optional(),
});
export type SessionStatusDto = z.infer<typeof sessionStatusSchema>;

export const sessionStatsSchema = z.object({
  samples: z.array(
    z.object({
      sessionId: z.string(),
      cpuPct: z.number(),
      memMb: z.number(),
      netRxKb: z.number().optional(),
      netTxKb: z.number().optional(),
    }),
  ),
});
export type SessionStatsDto = z.infer<typeof sessionStatsSchema>;

// ── Identity: auth providers (OIDC / SAML / LDAP) ────────────────────────────
export const createAuthConfigSchema = z.object({
  type: z.enum(['LOCAL', 'LDAP', 'SAML', 'OIDC']),
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(false),
  priority: z.number().int().min(0).max(1000).default(100),
  // Provider-specific config. OIDC: { issuer, clientId, clientSecret, scopes }.
  // SAML: { idpMetadataUrl, spEntityId, cert }. LDAP: { url, baseDN, bindDN, ... }.
  config: z.record(z.unknown()).default({}),
});
export type CreateAuthConfigDto = z.infer<typeof createAuthConfigSchema>;

export const updateAuthConfigSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateAuthConfigDto = z.infer<typeof updateAuthConfigSchema>;

// Federated login (LDAP bind) + LDAP live-test diagnostic.
export const ldapLoginSchema = z.object({
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});
export type LdapLoginDto = z.infer<typeof ldapLoginSchema>;

export const ldapTestSchema = z.object({
  sampleUsername: z.string().max(320).optional(),
});
export type LdapTestDto = z.infer<typeof ldapTestSchema>;

export const createSsoMappingSchema = z.object({
  authConfigId: z.string().min(1),
  groupId: z.string().min(1),
  attribute: z.string().min(1).max(200),
  value: z.string().min(1).max(400),
});
export type CreateSsoMappingDto = z.infer<typeof createSsoMappingSchema>;

// ── Deployment zones ─────────────────────────────────────────────────────────
export const createZoneSchema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  isDefault: z.boolean().default(false),
  proxyBaseUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).default({}),
});
export type CreateZoneDto = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    region: z.string().max(120).optional(),
    isDefault: z.boolean().optional(),
    proxyBaseUrl: z.string().url().optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateZoneDto = z.infer<typeof updateZoneSchema>;

// ── Session staging (pre-warmed pools) ───────────────────────────────────────
export const createStagingSchema = z.object({
  workspaceId: z.string().min(1),
  zoneId: z.string().min(1),
  desiredSessions: z.number().int().min(0).max(1000).default(0),
  enabled: z.boolean().default(true),
});
export type CreateStagingDto = z.infer<typeof createStagingSchema>;

export const updateStagingSchema = z
  .object({
    desiredSessions: z.number().int().min(0).max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateStagingDto = z.infer<typeof updateStagingSchema>;

// ── Casting (public kiosk links) ─────────────────────────────────────────────
export const createCastingSchema = z.object({
  workspaceId: z.string().min(1),
  allowAnonymous: z.boolean().default(false),
  requireAuth: z.boolean().default(true),
  groupId: z.string().optional(),
  errorPageId: z.string().optional(),
  maxConcurrent: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
});
export type CreateCastingDto = z.infer<typeof createCastingSchema>;

export const updateCastingSchema = z
  .object({
    allowAnonymous: z.boolean().optional(),
    requireAuth: z.boolean().optional(),
    groupId: z.string().optional(),
    errorPageId: z.string().optional(),
    maxConcurrent: z.number().int().positive().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateCastingDto = z.infer<typeof updateCastingSchema>;

// ── Servers (persistent RDP/VNC/SSH hosts) ───────────────────────────────────
export const createServerSchema = z.object({
  zoneId: z.string().min(1),
  hostname: z.string().min(1).max(253),
  address: z.string().min(1).max(253),
  connectionType: z.enum(['SSH', 'RDP', 'VNC']).default('RDP'),
  authMode: z.enum(['PASSWORD', 'KEY', 'VMWARE_TEMPLATE']).default('PASSWORD'),
  continuity: z.enum(['NONE', 'TMUX', 'SCREEN']).default('NONE'),
  vmTemplate: z.string().optional(),
  vmProviderId: z.string().optional(),
  maxSessions: z.number().int().min(1).max(1000).default(1),
});
export type CreateServerDto = z.infer<typeof createServerSchema>;

export const updateServerSchema = z
  .object({
    address: z.string().min(1).max(253).optional(),
    connectionType: z.enum(['SSH', 'RDP', 'VNC']).optional(),
    authMode: z.enum(['PASSWORD', 'KEY', 'VMWARE_TEMPLATE']).optional(),
    continuity: z.enum(['NONE', 'TMUX', 'SCREEN']).optional(),
    vmTemplate: z.string().optional(),
    vmProviderId: z.string().optional(),
    maxSessions: z.number().int().min(1).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateServerDto = z.infer<typeof updateServerSchema>;

// ── Server pools + autoscale ─────────────────────────────────────────────────
export const createPoolSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(['SERVER', 'AGENT']).default('AGENT'),
  startupScript: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type CreatePoolDto = z.infer<typeof createPoolSchema>;

export const updatePoolSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    startupScript: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdatePoolDto = z.infer<typeof updatePoolSchema>;

export const upsertAutoscaleSchema = z.object({
  mode: z.enum(['SCHEDULE', 'LOAD', 'ACTIVE_DIRECTORY']).default('SCHEDULE'),
  minStandby: z.number().int().min(0).default(0),
  maxInstances: z.number().int().min(1).default(1),
  perServerSessionLimit: z.number().int().min(1).default(1),
  checkinIntervalSec: z.number().int().min(10).default(60),
  downscaleBackoffSec: z.number().int().min(0).default(300),
  vmProviderId: z.string().optional(),
  dnsProviderId: z.string().optional(),
  schedules: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        hour: z.number().int().min(0).max(23),
        minStandby: z.number().int().min(0).default(0),
        maxInstances: z.number().int().min(1).default(1),
      }),
    )
    .max(168)
    .optional(),
});
export type UpsertAutoscaleDto = z.infer<typeof upsertAutoscaleSchema>;

// ── VM / DNS providers ───────────────────────────────────────────────────────
export const createVMProviderSchema = z.object({
  name: z.string().min(1).max(120),
  provider: z.enum([
    'AWS', 'AZURE', 'DIGITALOCEAN', 'GCP', 'HARVESTER', 'ORACLE',
    'NUTANIX', 'PROXMOX', 'VSPHERE', 'OPENSTACK', 'KUBEVIRT',
  ]),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type CreateVMProviderDto = z.infer<typeof createVMProviderSchema>;

export const createDNSProviderSchema = z.object({
  name: z.string().min(1).max(120),
  provider: z.enum(['AWS', 'AZURE', 'DIGITALOCEAN', 'GCP', 'ORACLE']),
  zoneName: z.string().max(253).optional(),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type CreateDNSProviderDto = z.infer<typeof createDNSProviderSchema>;

export const updateProviderSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    zoneName: z.string().max(253).optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateProviderDto = z.infer<typeof updateProviderSchema>;

// ── Webhooks ─────────────────────────────────────────────────────────────────
export const createWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  secret: z.string().min(8).max(200).optional(),
  enabled: z.boolean().default(true),
});
export type CreateWebhookDto = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    url: z.string().url().optional(),
    events: z.array(z.string().min(1)).min(1).optional(),
    secret: z.string().min(8).max(200).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateWebhookDto = z.infer<typeof updateWebhookSchema>;

// ── Connectivity: connection proxy ────────────────────────────────────────────
export const createConnectionProxySchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['GUACAMOLE']).default('GUACAMOLE'),
  host: z.string().min(1).max(253).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type CreateConnectionProxyDto = z.infer<typeof createConnectionProxySchema>;

export const updateConnectionProxySchema = z
  .object({
    host: z.string().min(1).max(253).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateConnectionProxyDto = z.infer<typeof updateConnectionProxySchema>;

// ── Connectivity: egress gateways ─────────────────────────────────────────────
export const createEgressGatewaySchema = z.object({
  name: z.string().min(1).max(120),
  provider: z.string().min(1).max(80),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type CreateEgressGatewayDto = z.infer<typeof createEgressGatewaySchema>;

export const updateEgressGatewaySchema = z
  .object({
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateEgressGatewayDto = z.infer<typeof updateEgressGatewaySchema>;

// ── Connectivity: web filter ───────────────────────────────────────────────────
export const createWebFilterSchema = z.object({
  name: z.string().min(1).max(120),
  categories: z.record(z.unknown()).default({}),
  cacheTtl: z.number().int().min(60).max(86400).default(3600),
  enabled: z.boolean().default(false),
});
export type CreateWebFilterDto = z.infer<typeof createWebFilterSchema>;

export const updateWebFilterSchema = z
  .object({
    categories: z.record(z.unknown()).optional(),
    cacheTtl: z.number().int().min(60).max(86400).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateWebFilterDto = z.infer<typeof updateWebFilterSchema>;

// ── Connectivity: browser isolation ──────────────────────────────────────────
export const createBrowserIsolationSchema = z.object({
  name: z.string().min(1).max(120),
  forwardProxy: z.string().max(80).optional(),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(false),
});
export type CreateBrowserIsolationDto = z.infer<typeof createBrowserIsolationSchema>;

export const updateBrowserIsolationSchema = z
  .object({
    forwardProxy: z.string().max(80).optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateBrowserIsolationDto = z.infer<typeof updateBrowserIsolationSchema>;

// ── Windows / RDS workspaces ──────────────────────────────────────────────────
// RemoteApp entries published from an RDS farm or a single Windows server.
export const createRemoteAppSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
  path: z.string().min(1).max(500),
  args: z.string().max(500).optional(),
});
export type CreateRemoteAppDto = z.infer<typeof createRemoteAppSchema>;

// ── Banners & watermarks ──────────────────────────────────────────────────────
// Session overlay policy (compliance banner + forensic watermark). The viewer
// renders the watermark text — including dynamic tokens like {{user}} — diagonally
// across the stream so screen captures carry an attributable mark.
export const upsertWatermarkSchema = z.object({
  scope: z.enum(['USER', 'GROUP', 'WORKSPACE']).default('WORKSPACE'),
  refId: z.string().min(1).optional(),
  bannerText: z.string().max(200).optional(),
  bannerColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb hex color')
    .optional(),
  watermarkText: z.string().max(200).optional(),
  watermarkOpacity: z.number().min(0).max(1).default(0.15),
});
export type UpsertWatermarkDto = z.infer<typeof upsertWatermarkSchema>;

// ── Log forwarding (SIEM) ─────────────────────────────────────────────────────
// Ships audit + container logs to an external collector. The API can render a
// ready-to-run Fluent Bit config for the chosen target (open-source shipper).
export const upsertLogForwarderSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(['syslog', 'splunk_hec', 'elasticsearch', 'loki', 'http']),
  endpoint: z.string().url().max(500).optional(),
  // Secret-looking fields (token, password, …) are sealed server-side into the
  // row's `secretRef` column; only a redacted copy is persisted in `config`.
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(false),
});
export type UpsertLogForwarderDto = z.infer<typeof upsertLogForwarderSchema>;

export const updateLogForwarderSchema = upsertLogForwarderSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateLogForwarderDto = z.infer<typeof updateLogForwarderSchema>;

// ── Session control (pause / resume / resize) ─────────────────────────────────
export const resizeSessionSchema = z.object({
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(240).max(4320),
});
export type ResizeSessionDto = z.infer<typeof resizeSessionSchema>;

// ── Image registries & marketplace ────────────────────────────────────────────
export const createRegistrySchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  type: z.enum(['FIRST_PARTY', 'THIRD_PARTY']).default('THIRD_PARTY'),
  enabled: z.boolean().default(true),
});
export type CreateRegistryDto = z.infer<typeof createRegistrySchema>;

export const updateRegistrySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    url: z.string().url().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateRegistryDto = z.infer<typeof updateRegistrySchema>;

// Install a registry entry → creates an Image (and optionally a Workspace).
export const installRegistryEntrySchema = z.object({
  createWorkspace: z.boolean().default(false),
  // edit-before-install overrides
  friendlyName: z.string().min(1).max(120).optional(),
  categories: z.array(z.string()).optional(),
  /** Override the docker image (e.g. pick a specific channel/tag). */
  imageOverride: z.string().min(1).max(300).optional(),
});
export type InstallRegistryEntryDto = z.infer<typeof installRegistryEntrySchema>;

// ── Licensing ──────────────────────────────────────────────────────────────────
export const upsertLicenseSchema = z.object({
  type: z.enum(['CONCURRENT', 'NAMED_USER']).default('CONCURRENT'),
  seats: z.number().int().min(1).max(1_000_000).default(5),
  concurrentSessions: z.number().int().min(1).max(1_000_000).default(5),
  issuedTo: z.string().max(200).optional(),
  notBefore: z.coerce.date().optional(),
  notAfter: z.coerce.date().optional(),
  features: z.record(z.unknown()).default({}),
});
export type UpsertLicenseDto = z.infer<typeof upsertLicenseSchema>;

// Activate an Ed25519-signed offline license key.
export const activateLicenseSchema = z.object({
  licenseKey: z.string().min(1).max(8000),
});
export type ActivateLicenseDto = z.infer<typeof activateLicenseSchema>;

// ── Settings: branding + general + config import/export ───────────────────────
export const upsertBrandingSchema = z.object({
  productName: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().max(1000).optional().or(z.literal('')),
  faviconUrl: z.string().url().max(1000).optional().or(z.literal('')),
  loginBackgroundUrl: z.string().url().max(1000).optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb hex color').optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb hex color').optional(),
  customCss: z.string().max(20000).optional().or(z.literal('')),
});
export type UpsertBrandingDto = z.infer<typeof upsertBrandingSchema>;

export const upsertSettingsSchema = z.object({
  settings: z.array(z.object({ key: z.string().min(1).max(120), value: z.unknown() })).max(100),
});
export type UpsertSettingsDto = z.infer<typeof upsertSettingsSchema>;

export const importConfigSchema = z.object({
  branding: upsertBrandingSchema.optional(),
  settings: z.array(z.object({ key: z.string().min(1).max(120), value: z.unknown() })).max(100).optional(),
});
export type ImportConfigDto = z.infer<typeof importConfigSchema>;
