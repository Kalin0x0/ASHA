import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The validator is only worth anything if Traefik actually asks it.
 *
 * For most of this project's life `sess-auth` pointed at `/api/v1/health/live`,
 * a handler that returns 200 unconditionally — the gate existed, was attached to
 * every session router, and permitted everything. A config edit could put it
 * back there tomorrow and no unit test of the decision logic would notice, so
 * the wiring is asserted here.
 */

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('session forward-auth wiring', () => {
  const dynamic = read('infra/traefik/dynamic/dynamic.yml');

  it('points the gate at the validator, not at a health endpoint', () => {
    expect(dynamic).toContain('/api/v1/internal/session-auth');
    // The exact regression: a liveness probe answers 200 for everyone.
    expect(dynamic).not.toMatch(/forwardAuth[\s\S]{0,200}health\/(live|ready)/);
  });

  it('serves that route from a controller that exists', () => {
    // A gate pointed at a 404 fails closed rather than open, but the stream is
    // just as dead — so the path in the config has to match the controller.
    const controller = read('apps/api/src/modules/session-auth/session-auth.controller.ts');
    expect(controller).toContain("@Controller('internal')");
    expect(controller).toContain("@Get('session-auth')");
    // Traefik reaches it over the internal network with no bearer token.
    expect(controller).toContain('@Public()');
  });

  it('is registered in the application module', () => {
    // Without this the route is a 404 and every session stream stops.
    expect(read('apps/api/src/app.module.ts')).toContain('SessionAuthModule');
  });

  it('attaches the gate to every session router the agent creates', () => {
    const docker = read('apps/agent/src/docker.ts');
    expect(docker).toContain("forwardAuthMiddleware: 'sess-auth@file'");
    // The audio route reaches the same container on another port; leaving it
    // ungated would be a second, unguarded door into the same desktop.
    expect(docker).toMatch(/audioRouter}\.middlewares.*sess-auth@file/);
  });

  it('keeps the gate ahead of the strip on the audio route too', () => {
    // Same reason as the main router: the strip removes the session id the gate
    // reads from the path.
    const docker = read('apps/agent/src/docker.ts');
    const order = /audioRouter}\.middlewares`\] = `([^`]+)`/.exec(docker)?.[1] ?? '';
    expect(order.indexOf('sess-auth@file')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('sess-auth@file')).toBeLessThan(order.indexOf('-strip'));
  });
});
