import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger };

export function createLogger(name: string, opts: LoggerOptions = {}): Logger {
  const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  return pino({
    name,
    level,
    base: { service: name },
    redact: ['req.headers.authorization', 'password', '*.secret', '*.secretRef'],
    ...opts,
  });
}

export interface AuditEntry {
  orgId?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}
