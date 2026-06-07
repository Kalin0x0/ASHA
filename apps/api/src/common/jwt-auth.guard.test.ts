import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AGENT_ONLY, IS_PUBLIC } from './decorators';

// The guard falls back to a DB lookup for minted RegistrationTokens when the
// shared env token doesn't match; mock it so unit tests stay hermetic.
vi.mock('@chista/db', () => ({
  prisma: {
    registrationToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
  runUnscoped: (fn: () => unknown) => fn(),
}));

const AGENT_TOKEN = 'agent-shared-secret-123';
const env = { JWT_ACCESS_SECRET: 'access-secret', CHISTA_AGENT_ENROLLMENT_TOKEN: AGENT_TOKEN } as never;

/** Build an ExecutionContext whose request carries the given headers. */
function contextWith(headers: Record<string, string>) {
  const req: { headers: Record<string, string>; user?: unknown } = { headers };
  return {
    ctx: {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as never,
    req,
  };
}

/** A Reflector stub that reports which decorator metadata is present. */
function reflectorFor(flags: { public?: boolean; agentOnly?: boolean }): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      (key === IS_PUBLIC && flags.public) || (key === AGENT_ONLY && flags.agentOnly) || false,
  } as unknown as Reflector;
}

describe('JwtAuthGuard — agent-only routes', () => {
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn() };
  });

  it('rejects an agent-only route with NO x-agent-token (the old bypass)', async () => {
    const guard = new JwtAuthGuard(reflectorFor({ agentOnly: true }), jwt as never, env);
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid agent token');
  });

  it('rejects an agent-only route with the WRONG token', async () => {
    const guard = new JwtAuthGuard(reflectorFor({ agentOnly: true }), jwt as never, env);
    const { ctx } = contextWith({ 'x-agent-token': 'nope' });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid agent token');
  });

  it('accepts an agent-only route with the CORRECT token', async () => {
    const guard = new JwtAuthGuard(reflectorFor({ agentOnly: true }), jwt as never, env);
    const { ctx } = contextWith({ 'x-agent-token': AGENT_TOKEN });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // An agent-only route must never fall through to JWT verification.
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('accepts an agent-only route with a valid minted RegistrationToken', async () => {
    const { prisma } = await import('@chista/db');
    (prisma.registrationToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 't1',
      orgId: 'o1',
      zoneId: null,
      revokedAt: null,
      expiresAt: null,
    });
    const guard = new JwtAuthGuard(reflectorFor({ agentOnly: true }), jwt as never, env);
    const { ctx } = contextWith({ 'x-agent-token': 'cra_minted_token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('still lets @Public() routes through without any token', async () => {
    const guard = new JwtAuthGuard(reflectorFor({ public: true }), jwt as never, env);
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a normal route with no bearer token', async () => {
    const guard = new JwtAuthGuard(reflectorFor({}), jwt as never, env);
    const { ctx } = contextWith({});
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing bearer token');
  });

  it('verifies the JWT on a normal protected route', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', orgId: 'org1' });
    const guard = new JwtAuthGuard(reflectorFor({}), jwt as never, env);
    const { ctx, req } = contextWith({ authorization: 'Bearer good-jwt' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 'u1', orgId: 'org1' });
  });
});
