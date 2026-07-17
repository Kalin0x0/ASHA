import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { z } from 'zod';
import type { UpsertLicenseDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';

// Asha license-signing public key (Ed25519, SPKI DER base64). Licenses are
// signed offline by the vendor's private key and verified here — no phone-home.
// Override with ASHA_LICENSE_PUBKEY to use a custom signing key.
const DEFAULT_LICENSE_PUBKEY = 'MCowBQYDK2VwAyEArZLVMVmDutZKSJg3dFTBCuE5NbRMnYi3W+7lUkqUAPc=';

interface LicenseClaims {
  type: 'CONCURRENT' | 'NAMED_USER';
  seats: number;
  concurrentSessions: number;
  issuedTo?: string;
  notBefore?: string;
  notAfter?: string;
  installationId?: string;
  features?: Record<string, unknown>;
}

// Runtime shape check for the (signed) claims — a vendor payload-format mistake
// must fail cleanly, not silently default seats or 500 on a bad Int write.
const licenseClaimsSchema = z.object({
  type: z.enum(['CONCURRENT', 'NAMED_USER']),
  seats: z.number().int().positive(),
  concurrentSessions: z.number().int().positive(),
  issuedTo: z.string().optional(),
  notBefore: z.string().optional(),
  notAfter: z.string().optional(),
  installationId: z.string().optional(),
  features: z.record(z.unknown()).optional(),
});

/** Verify an Ed25519-signed license key `<base64url(payload)>.<base64url(sig)>`. */
function verifyLicenseKey(licenseKey: string): LicenseClaims {
  const parts = licenseKey.trim().split('.');
  const payloadB64 = parts[0];
  const sigB64 = parts[1];
  if (parts.length !== 2 || !payloadB64 || !sigB64) throw new BadRequestException('Malformed license key');
  let pubKey;
  try {
    pubKey = createPublicKey({
      key: Buffer.from(process.env.ASHA_LICENSE_PUBKEY ?? DEFAULT_LICENSE_PUBKEY, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new BadRequestException('License public key is misconfigured');
  }
  if (!edVerify(null, Buffer.from(payloadB64), pubKey, Buffer.from(sigB64, 'base64url'))) {
    throw new BadRequestException('Invalid license signature');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid license payload');
  }
  const result = licenseClaimsSchema.safeParse(parsed);
  if (!result.success) throw new BadRequestException('Invalid license claims');
  return result.data;
}

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

  /** Stable per-deployment installation id — a license can be bound to it. */
  installationId(orgId: string): string {
    return createHash('sha256').update(`asha:${orgId}`).digest('hex').slice(0, 24);
  }

  /**
   * Activate an Ed25519-signed (air-gapped) license. The signature is verified
   * against the baked public key; tampered, expired, or wrong-installation
   * licenses are rejected. No network call is made.
   */
  async activate(orgId: string, actorUserId: string, licenseKey: string) {
    const claims = verifyLicenseKey(licenseKey);
    if (claims.type !== 'CONCURRENT' && claims.type !== 'NAMED_USER') {
      throw new BadRequestException('Unknown license type');
    }
    if (claims.notAfter && new Date() > new Date(claims.notAfter)) {
      throw new BadRequestException('License has expired');
    }
    if (claims.installationId && claims.installationId !== this.installationId(orgId)) {
      throw new BadRequestException('License is bound to a different installation');
    }
    const data = {
      orgId,
      type: claims.type,
      seats: claims.seats,
      concurrentSessions: claims.concurrentSessions,
      issuedTo: claims.issuedTo ?? null,
      notBefore: claims.notBefore ? new Date(claims.notBefore) : null,
      notAfter: claims.notAfter ? new Date(claims.notAfter) : null,
      features: (claims.features ?? {}) as object,
    };
    const existing = await prisma.license.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } });
    const license = existing
      ? await prisma.license.update({ where: { id: existing.id }, data })
      : await prisma.license.create({ data });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'license.activate',
      targetType: 'License',
      targetId: license.id,
      metadata: { type: claims.type, issuedTo: claims.issuedTo ?? null, offline: true },
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
      // Unclaimed staged pool sessions (userId null) are infrastructure, not a
      // launched session — a claim converts an existing row (zero net
      // concurrency). Counting them would let a full warm pool 403 every real
      // launch and starve the org of the very capacity it paid for.
      const active = await prisma.session.count({
        where: { orgId, userId: { not: null }, status: { in: LicensingService.ACTIVE as never } },
      });
      if (active >= license.concurrentSessions) {
        throw new ForbiddenException(
          `Concurrent session limit reached (${license.concurrentSessions}). Upgrade your license to launch more.`,
        );
      }
    } else {
      // NAMED_USER: count distinct users who have ever launched a session.
      // Unclaimed staged sessions (userId null) are infrastructure, not a seat.
      const grouped = await prisma.session.groupBy({
        by: ['userId'],
        where: { orgId, userId: { not: null } },
      });
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
      where: { orgId, userId: { not: null }, status: { in: LicensingService.ACTIVE as never } },
    });
    const grouped = await prisma.session.groupBy({
      by: ['userId'],
      where: { orgId, userId: { not: null } },
    });
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
