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
