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
export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  friendlyName: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['CONTAINER', 'SERVER', 'REMOTE_APP', 'VM', 'LINK']).default('CONTAINER'),
  imageId: z.string().optional(),
  categories: z.array(z.string()).default([]),
  coresLimit: z.number().optional(),
  memLimitMb: z.number().optional(),
  gpuCount: z.number().int().min(0).default(0),
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
    categories: z.array(z.string()),
    coresLimit: z.number(),
    memLimitMb: z.number(),
    gpuCount: z.number().int().min(0),
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
  status: z.enum(['PROVISIONING', 'RUNNING', 'DEGRADED', 'DESTROYED', 'ERROR']),
  containerId: z.string().optional(),
  internalHost: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  traefikRouterName: z.string().optional(),
  error: z.string().optional(),
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
