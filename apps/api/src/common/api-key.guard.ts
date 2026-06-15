import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hashToken, safeEqual } from '@chista/crypto';
import { prisma, runUnscoped } from '@chista/db';

export const SCOPES_KEY = 'apiScopes';
/** Require the API key to carry these scopes (a key with the '*' scope passes any check). */
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

/**
 * Authenticates Developer-API requests with an API key (header `X-Api-Key` or
 * `Authorization: ApiKey <key>`). Keys are high-entropy random tokens stored as
 * sha256; lookup is by the 8-char prefix, then a timing-safe hash compare. On
 * success it installs a synthetic principal on `req.user` (so the tenant
 * interceptor + downstream services scope to the key's org) and enforces scopes.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    const presented =
      (req.headers['x-api-key'] as string | undefined) ??
      (typeof header === 'string' && header.startsWith('ApiKey ') ? header.slice(7) : undefined);
    if (!presented || presented.length < 8) {
      throw new UnauthorizedException('Missing or malformed API key');
    }

    const prefix = presented.slice(0, 8);
    const hashed = hashToken(presented);
    const key = await runUnscoped(async () => {
      const k = await prisma.apiKey.findUnique({ where: { prefix } });
      if (!k || k.revokedAt || (k.expiresAt && k.expiresAt.getTime() < Date.now())) return null;
      if (!safeEqual(hashed, k.hashedKey)) return null;
      await prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      return k;
    });
    if (!key) throw new UnauthorizedException('Invalid API key');

    req.user = {
      sub: key.userId ?? `apikey:${key.id}`,
      orgId: key.orgId,
      email: `apikey:${key.prefix}`,
      isSystemAdmin: false,
    };
    req.apiKey = { id: key.id, scopes: key.scopes };

    const required =
      this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const granted = new Set(key.scopes);
    if (required.length > 0 && !granted.has('*') && !required.every((s) => granted.has(s))) {
      throw new ForbiddenException(`API key missing required scope(s): ${required.join(', ')}`);
    }
    return true;
  }
}
