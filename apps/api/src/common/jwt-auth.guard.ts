import { createHash } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '@chista/config';
import { prisma, runUnscoped } from '@chista/db';
import { safeEqual } from '@chista/crypto';
import { AGENT_ONLY, IS_PUBLIC } from './decorators';
import { ENV } from './env.module';

/** What an x-agent-token authorizes: the shared env token (global) or a minted, org-scoped token. */
export type AgentTokenScope =
  | { scope: 'global' }
  | { scope: 'org'; orgId: string; zoneId: string | null };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, meta)) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();

    // Agent-only internal endpoints authenticate with a shared enrollment token
    // (x-agent-token), not a user JWT. Validate it with a timing-safe compare —
    // these routes previously bypassed authentication entirely.
    if (this.reflector.getAllAndOverride<boolean>(AGENT_ONLY, meta)) {
      const presented = req.headers['x-agent-token'] as string | undefined;
      if (!presented) throw new UnauthorizedException('Invalid agent token');
      // 1) Shared env enrollment token (timing-safe) — global enrollment.
      if (safeEqual(presented, this.env.CHISTA_AGENT_ENROLLMENT_TOKEN)) {
        req.agentToken = { scope: 'global' } satisfies AgentTokenScope;
        return true;
      }
      // 2) A minted RegistrationToken — enrollment is constrained to its org/zone.
      const scope = await this.resolveRegistrationToken(presented);
      if (scope) {
        req.agentToken = scope;
        return true;
      }
      throw new UnauthorizedException('Invalid agent token');
    }

    const header = req.headers['authorization'] as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      req.user = await this.jwt.verifyAsync(token, { secret: this.env.JWT_ACCESS_SECRET });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Validate a presented agent token against minted RegistrationTokens. Runs
   * unscoped (agent routes carry no user/org context); matches by sha256 hash,
   * rejects revoked/expired, and records usage. Only reached when the shared env
   * token did NOT match, so the default single-token path stays untouched.
   */
  private async resolveRegistrationToken(presented: string): Promise<AgentTokenScope | null> {
    const tokenHash = createHash('sha256').update(presented).digest('hex');
    return runUnscoped(async () => {
      const rec = await prisma.registrationToken.findUnique({ where: { tokenHash } });
      if (!rec || rec.revokedAt || (rec.expiresAt && rec.expiresAt.getTime() < Date.now())) {
        return null;
      }
      await prisma.registrationToken
        .update({ where: { id: rec.id }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } })
        .catch(() => undefined);
      return { scope: 'org', orgId: rec.orgId, zoneId: rec.zoneId };
    });
  }
}
