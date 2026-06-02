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
import { safeEqual } from '@chista/crypto';
import { AGENT_ONLY, IS_PUBLIC } from './decorators';
import { ENV } from './env.module';

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
      if (!presented || !safeEqual(presented, this.env.CHISTA_AGENT_ENROLLMENT_TOKEN)) {
        throw new UnauthorizedException('Invalid agent token');
      }
      return true;
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
}
