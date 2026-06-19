import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@asha/db';
import type { AuditEntry } from '@asha/logger';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  async record(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          orgId: entry.orgId ?? null,
          actorUserId: entry.actorUserId ?? null,
          actorApiKeyId: entry.actorApiKeyId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          metadata: (entry.metadata ?? {}) as object,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log: ${(err as Error).message}`);
    }
  }
}
