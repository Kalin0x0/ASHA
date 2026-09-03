import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Env } from '@asha/config';
import { ENV } from '../../common/env.module';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import {
  SESSION_COOKIE,
  cookiePath,
  decideSessionAuth,
  kasmIdFromPath,
} from './session-auth.logic';

/**
 * The forward-auth gate Traefik consults before it proxies a session stream.
 *
 * Until this existed, `sess-auth@file` pointed at `/health/live` — a handler that
 * unconditionally returns 200 — so every KasmVNC desktop was reachable by anyone
 * who knew its kasmId, with Traefik itself injecting the container's Basic
 * credentials on the way in. The per-session JWT the manager mints and puts in
 * `?token=` was verified by nobody. This is the validator the config always
 * said belonged here.
 *
 * Not reachable from outside: Traefik calls it over the internal network, and it
 * grants nothing on its own — a 200 only tells Traefik to forward the request it
 * already holds.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('internal')
export class SessionAuthController {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Verify a JWT and return the session it is for, or null. */
  private sessionOf(token: string, requireCookieType: boolean): string | null {
    try {
      const payload = this.jwt.verify<{ kasmId?: string; typ?: string }>(token, {
        secret: this.env.SESSION_TOKEN_SECRET,
      });
      // The cookie carries `typ` so a long-lived cookie value cannot be replayed
      // as a URL token, nor a URL token pasted in as a cookie to skip the
      // exchange — each proof is only good for the hop it was minted for.
      if (requireCookieType !== (payload.typ === 'sess-cookie')) return null;
      return payload.kasmId ?? null;
    } catch {
      return null;
    }
  }

  @Public()
  @Get('session-auth')
  gate(
    @Headers('x-forwarded-uri') forwardedUri: string | undefined,
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() res: Response,
  ): void {
    const verdict = decideSessionAuth({
      forwardedUri,
      forwardedHost,
      cookieHeader,
      readCookieToken: (t) => this.sessionOf(t, true),
      readUrlToken: (t) => this.sessionOf(t, false),
    });

    if (verdict.action === 'deny') {
      // Deliberately bare: the body is returned to the browser verbatim, and a
      // reason would tell a prober whether the session exists.
      res.status(401).send('Unauthorized');
      return;
    }

    if (verdict.action === 'allow') {
      res.status(204).end();
      return;
    }

    // Exchange: mint the cookie and bounce the browser to the same URL without
    // the token. This MUST be a non-2xx response — Traefik copies a 2xx auth
    // response's headers onto the upstream request, and only returns a non-2xx
    // one to the browser, so a `Set-Cookie` on a 200 would never arrive.
    const mode = kasmIdFromPath((forwardedUri ?? '').split('?')[0] ?? '') ? 'path' : 'subdomain';
    const ttl = this.env.SESSION_COOKIE_TTL;
    const cookie = this.jwt.sign(
      { kasmId: verdict.kasmId, typ: 'sess-cookie' },
      { secret: this.env.SESSION_TOKEN_SECRET, expiresIn: ttl },
    );
    const attrs = [
      `${SESSION_COOKIE}=${cookie}`,
      `Path=${cookiePath(verdict.kasmId, mode)}`,
      `Max-Age=${ttl}`,
      'HttpOnly',
      'Secure',
      `SameSite=${this.env.SESSION_COOKIE_SAMESITE}`,
    ];
    res.setHeader('Set-Cookie', attrs.join('; '));
    res.setHeader('Location', verdict.location);
    // 302, not 307: the follow-up must be a GET even if the gated request was
    // not, and the browser must not replay a body it already sent.
    res.status(302).end();
  }
}
