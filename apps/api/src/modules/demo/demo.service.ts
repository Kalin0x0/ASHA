import { ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '@asha/config';
import { hashToken } from '@asha/crypto';
import { prisma } from '@asha/db';
import { ENV } from '../../common/env.module';
import { SecurityEventService } from '../../common/security-event.service';

/** How long a demo account lives. */
const DEMO_MINUTES = 10;
const DEMO_SECONDS = DEMO_MINUTES * 60;
const DEMO_TARIFF_NAME = 'Demo (10 min)';

export interface StartDemoInput {
  email: string;
  fingerprint: string;
  ip?: string;
  userAgent?: string;
}

/**
 * 10-minute demo accounts. One demo per e-mail AND per device (best-effort
 * browser fingerprint — a web app cannot read real hardware, so this is
 * deliberately evadable and backed up by IP recording + SIEM logging). A repeat
 * attempt on either key is rejected and reported as a security event. The demo
 * user is deny-by-default isolated (Part B), time-boxed by a 10-minute tariff
 * (Part A) and pruned by the reaper once `demoExpiresAt` passes.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly jwt: JwtService,
    private readonly security: SecurityEventService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Public: is the demo button enabled for this deployment? */
  async getConfig(): Promise<{ enabled: boolean }> {
    const org = await prisma.org.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) return { enabled: false };
    return { enabled: await this.isEnabled(org.id) };
  }

  private async isEnabled(orgId: string): Promise<boolean> {
    const row = await prisma.setting.findUnique({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId, zoneId: '', key: 'demo.enabled' } },
    });
    // Default ON so the feature works out of the box; admins can turn it off.
    return row?.valueJson !== false;
  }

  async startDemo(input: StartDemoInput) {
    const org = await prisma.org.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) throw new ServiceUnavailableException('Demo is not available');
    const orgId = org.id;
    if (!(await this.isEnabled(orgId))) throw new ForbiddenException('Demo access is disabled');

    const email = input.email.trim().toLowerCase();
    const fingerprintHash = hashToken(input.fingerprint || 'unknown');

    // ── Dedup: one demo per e-mail OR per device ──────────────────────────────
    const priorGrant = await prisma.demoGrant.findFirst({
      where: { orgId, OR: [{ email }, { fingerprintHash }] },
    });
    if (priorGrant) {
      await this.security.emit({
        action: 'auth.demo_abuse',
        severity: 'warn',
        orgId,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: {
          email,
          fingerprintHash,
          reason: priorGrant.email === email ? 'email_reused' : 'device_reused',
          priorGrantId: priorGrant.id,
        },
      });
      throw new ForbiddenException('A demo has already been used for this e-mail or device.');
    }

    // A real (non-demo) account already owns this e-mail → don't shadow it.
    const existingUser = await prisma.user.findFirst({ where: { orgId, email } });
    if (existingUser) {
      await this.security.emit({
        action: 'auth.demo_abuse',
        severity: 'warn',
        orgId,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { email, fingerprintHash, reason: 'existing_account' },
      });
      throw new ForbiddenException('This e-mail already has an account. Please sign in instead.');
    }

    const now = Date.now();
    const demoExpiresAt = new Date(now + DEMO_SECONDS * 1000);

    // ── Mint the demo user ────────────────────────────────────────────────────
    const username = `demo-${hashToken(email + fingerprintHash).slice(0, 10)}`;
    const user = await prisma.user.create({
      data: {
        orgId,
        email,
        username,
        displayName: 'Demo user',
        status: 'DEMO',
        isSystemAdmin: false,
        locale: 'en',
        demoExpiresAt,
      },
    });

    // Join the dedicated "Demo Users" group (carries the end-user role but no
    // workspace grants → keeps demo users isolated). Fall back to the org default
    // group if a deployment hasn't seeded a demo group.
    const group =
      (await prisma.group.findFirst({ where: { orgId, name: 'Demo Users' } })) ??
      (await prisma.group.findFirst({ where: { orgId, isDefault: true } }));
    if (group) {
      await prisma.userGroup.create({ data: { orgId, userId: user.id, groupId: group.id } });
    }

    // Grant every demo-flagged workspace (deny-by-default hides everything else).
    const demoWorkspaces = await prisma.workspace.findMany({ where: { orgId, isDemo: true, enabled: true }, select: { id: true } });
    for (const ws of demoWorkspaces) {
      await prisma.workspaceUser.create({ data: { orgId, workspaceId: ws.id, userId: user.id } });
    }

    // Time-box with a 10-minute tariff (reuses Part A metering + session cap).
    const tariff =
      (await prisma.tariff.findFirst({ where: { orgId, name: DEMO_TARIFF_NAME } })) ??
      (await prisma.tariff.create({
        data: { orgId, name: DEMO_TARIFF_NAME, period: 'MINUTE', budgetMinutes: DEMO_MINUTES, maxSessionMinutes: DEMO_MINUTES, maxConcurrent: 1 },
      }));
    await prisma.tariffAssignment.upsert({
      where: { orgId_subjectType_subjectId: { orgId, subjectType: 'USER', subjectId: user.id } },
      create: { orgId, tariffId: tariff.id, subjectType: 'USER', subjectId: user.id, remainingSeconds: DEMO_SECONDS, periodResetAt: demoExpiresAt },
      update: { tariffId: tariff.id, remainingSeconds: DEMO_SECONDS, periodResetAt: demoExpiresAt },
    });

    // Record the one-shot grant (persists even after the user is pruned).
    await prisma.demoGrant.create({
      data: { orgId, email, fingerprintHash, ip: input.ip ?? null, userId: user.id },
    });

    await this.security.emit({
      action: 'auth.demo_started',
      severity: 'info',
      orgId,
      actorUserId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { email, fingerprintHash, expiresAt: demoExpiresAt.toISOString() },
    });

    // ── Mint a 10-minute access token, capped like impersonate/stepUp, NO
    //    refresh token — a demo simply expires and cannot be silently extended.
    const ttl = Math.min(this.env.JWT_ACCESS_TTL, DEMO_SECONDS);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, orgId: user.orgId, email: user.email, isSystemAdmin: false, demo: true },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: ttl },
    );

    return {
      accessToken,
      refreshToken: null,
      expiresIn: ttl,
      tokenType: 'Bearer' as const,
      demoExpiresAt: demoExpiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        orgId: user.orgId,
        isSystemAdmin: false,
      },
    };
  }
}
