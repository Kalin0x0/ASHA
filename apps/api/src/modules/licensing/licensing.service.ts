import { ForbiddenException, Injectable } from '@nestjs/common';
import type { UpsertLicenseDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * License enforcement. Two modes:
 *   • CONCURRENT  — caps the number of simultaneously-active sessions.
 *   • NAMED_USER  — caps the number of distinct users who have ever launched.
 * A license with no record means "unlicensed / community" → generous defaults
 * so a fresh install is never blocked; an explicit license enforces its limits.
 */
@Injectable()
export class LicensingService {
  // Statuses that count against a CONCURRENT license.
  private static readonly ACTIVE = ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED'];

  constructor(private readonly audit: AuditService) {}

  get(orgId: string) {
    return prisma.license.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  }

  async upsert(orgId: string, actorUserId: string, dto: UpsertLicenseDto) {
    const existing = await prisma.license.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } });
    const data = {
      orgId,
      type: dto.type,
      seats: dto.seats,
      concurrentSessions: dto.concurrentSessions,
      issuedTo: dto.issuedTo,
      notBefore: dto.notBefore,
      notAfter: dto.notAfter,
      features: dto.features as object,
    };
    const license = existing
      ? await prisma.license.update({ where: { id: existing.id }, data })
      : await prisma.license.create({ data });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'license.upsert',
      targetType: 'License',
      targetId: license.id,
      metadata: { type: dto.type, seats: dto.seats, concurrentSessions: dto.concurrentSessions },
    });
    return license;
  }

  /**
   * Enforce the license before a new session is created. Throws 403 when the
   * cap is exceeded or the license window is closed. No-op when unlicensed.
   */
  async assertCanLaunch(orgId: string, userId: string): Promise<void> {
    const license = await this.get(orgId);
    if (!license) return; // community / unlicensed → unrestricted

    const now = new Date();
    if (license.notBefore && now < license.notBefore) {
      throw new ForbiddenException('License is not yet valid');
    }
    if (license.notAfter && now > license.notAfter) {
      throw new ForbiddenException('License has expired');
    }

    if (license.type === 'CONCURRENT') {
      const active = await prisma.session.count({
        where: { orgId, status: { in: LicensingService.ACTIVE as never } },
      });
      if (active >= license.concurrentSessions) {
        throw new ForbiddenException(
          `Concurrent session limit reached (${license.concurrentSessions}). Upgrade your license to launch more.`,
        );
      }
    } else {
      // NAMED_USER: count distinct users who have ever launched a session.
      const grouped = await prisma.session.groupBy({ by: ['userId'], where: { orgId } });
      const seatsUsed = new Set(grouped.map((g) => g.userId));
      if (!seatsUsed.has(userId) && seatsUsed.size >= license.seats) {
        throw new ForbiddenException(
          `Named-user seat limit reached (${license.seats}). Add seats to license another user.`,
        );
      }
    }
  }

  /** Snapshot current usage for reporting / the admin license page. */
  async usage(orgId: string) {
    const license = await this.get(orgId);
    const concurrent = await prisma.session.count({
      where: { orgId, status: { in: LicensingService.ACTIVE as never } },
    });
    const grouped = await prisma.session.groupBy({ by: ['userId'], where: { orgId } });
    const namedUsers = new Set(grouped.map((g) => g.userId)).size;
    if (license) {
      await prisma.licenseUsageSample.create({
        data: { licenseId: license.id, concurrentSessions: concurrent, namedUsers },
      });
    }
    return {
      type: license?.type ?? null,
      seats: license?.seats ?? null,
      concurrentSessions: license?.concurrentSessions ?? null,
      usedConcurrent: concurrent,
      usedSeats: namedUsers,
      licensed: Boolean(license),
    };
  }
}
