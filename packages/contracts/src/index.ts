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
