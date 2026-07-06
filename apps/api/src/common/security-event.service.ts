import { Injectable } from '@nestjs/common';
import { createLogger } from '@asha/logger';
import { AuditService } from './audit.service';

export interface SecurityEvent {
  /** Dotted action key, e.g. 'auth.demo_abuse'. */
  action: string;
  /** 'info' for notable-but-normal, 'warn' for suspicious, 'error' for confirmed abuse. */
  severity?: 'info' | 'warn' | 'error';
  orgId?: string;
  actorUserId?: string;
  ip?: string;
  userAgent?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Security events go to two sinks at once:
 *  1. the durable DB audit trail (AuditService → AuditLog), queryable in the admin UI; and
 *  2. a structured stdout line via the shared pino logger, which the Fluent Bit
 *     forwarder (see LogForwardingService) ships to the configured SIEM.
 *
 * This closes the "no runtime SIEM emission" gap: previously the forwarder only
 * rendered config and nothing in the API emitted structured security lines.
 */
@Injectable()
export class SecurityEventService {
  private readonly log = createLogger('security');

  constructor(private readonly audit: AuditService) {}

  async emit(event: SecurityEvent): Promise<void> {
    const severity = event.severity ?? 'warn';

    // 1) SIEM line — structured, single event object under a stable shape.
    this.log[severity](
      {
        kind: 'security_event',
        action: event.action,
        orgId: event.orgId,
        actorUserId: event.actorUserId,
        ip: event.ip,
        userAgent: event.userAgent,
        targetType: event.targetType,
        targetId: event.targetId,
        ...event.metadata,
      },
      `security.${event.action}`,
    );

    // 2) Durable audit row (best-effort; AuditService swallows its own errors).
    await this.audit.record({
      orgId: event.orgId,
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      ip: event.ip,
      userAgent: event.userAgent,
      metadata: event.metadata,
    });
  }
}
