import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Env } from '@asha/config';
import { ENV } from '../../common/env.module';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { ObserveGrantService } from './observe-grant.service';
import {
  SESSION_COOKIE,
  type SessionProof,
  cookiePath,
  decideSessionAuth,
  isObservePath,
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
    private readonly grants: ObserveGrantService,
  ) {}

  /** Verify a JWT and return what it proves about a session, or null. */
  private sessionOf(token: string, requireCookieType: boolean, observe: boolean): SessionProof | null {
    try {
      const payload = this.jwt.verify<{ kasmId?: string; sub?: string; typ?: string; obs?: boolean }>(token, {
        secret: this.env.SESSION_TOKEN_SECRET,
      });
      // The cookie carries `typ` so a long-lived cookie value cannot be replayed
      // as a URL token, nor a URL token pasted in as a cookie to skip the
      // exchange — each proof is only good for the hop it was minted for.
      if (requireCookieType !== (payload.typ === 'sess-cookie')) return null;
      // And `obs` so it is only good for the ROUTE it was minted for — the URL
      // token every bit as much as the cookie. The Path attribute already keeps
      // a browser from sending an observer's cookie to the write route, but the
      // token is handed to the observer's own address bar: unmarked, it is
      // byte-identical to the owner's and buys a write cookie on
      // `/session/<kasmId>/`, which Traefik serves with the KasmVNC account that
      // may type. Marked, it is refused there — and an owner's token is refused
      // on the observe route in the same stroke.
      if (Boolean(payload.obs) !== observe) return null;
      if (!payload.kasmId) return null;
      // Only an observer's proof names anybody: `sub` on a marked token is the
      // administrator the observation was granted to.
      return { kasmId: payload.kasmId, ...(payload.obs && payload.sub ? { observerUserId: payload.sub } : {}) };
    } catch {
      return null;
    }
  }

  @Public()
  @Get('session-auth')
  async gate(
    @Headers('x-forwarded-uri') forwardedUri: string | undefined,
    @Headers('x-forwarded-host') forwardedHost: string | undefined,
    @Headers('x-forwarded-proto') forwardedProto: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const path = (forwardedUri ?? '').split('?')[0] ?? '';
    const observing = isObservePath(path);
    const verdict = decideSessionAuth({
      forwardedUri,
      forwardedHost,
      cookieHeader,
      readCookieToken: (t) => this.sessionOf(t, true, observing),
      readUrlToken: (t) => this.sessionOf(t, false, observing),
    });

    if (verdict.action === 'deny') {
      // Deliberately bare: the body is returned to the browser verbatim, and a
      // reason would tell a prober whether the session exists.
      res.status(401).send('Unauthorized');
      return;
    }

    // An observation is authorized by a window that is open NOW, so the gate
    // asks on every request rather than trusting a credential it minted once.
    // Pressing stop ends the window; so does a hold left to lapse by a closed
    // laptop, and so does withdrawing SESSION_OBSERVE, whose next renewal is
    // then refused. None of the three can reach a cookie already sitting in a
    // browser — without this read the observer just re-opens the URL out of
    // their history and watches on, unannounced and unaudited.
    //
    // Only the observe route pays for this. A user reaching their own desktop
    // never gets here, so no Redis hiccup can put them in front of a 401.
    const grantEndsAt = observing ? await this.grants.holdExpiry(verdict.kasmId, verdict.observerUserId) : 0;
    if (observing && grantEndsAt <= Date.now()) {
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
    const mode = kasmIdFromPath(path) ? 'path' : 'subdomain';
    // A session cookie lives as long as the desktop it opens. An observer's may
    // not: it is minted against a grant that is renewed every 20 s and lapses 90 s
    // after the last renewal, so it expires with that grant instead of twelve
    // hours later. The per-request check above is what actually ends an
    // observation; this is what keeps the credential itself from being worth
    // stealing, and what an observer runs into if that check is ever lost. An
    // observer whose cookie ran out re-opens the desktop from the wall, which
    // mints a new one — the watched user's side is untouched either way.
    const ttl = observing
      ? Math.max(1, Math.min(this.env.SESSION_COOKIE_TTL, Math.ceil((grantEndsAt - Date.now()) / 1000)))
      : this.env.SESSION_COOKIE_TTL;
    const cookie = this.jwt.sign(
      {
        kasmId: verdict.kasmId,
        typ: 'sess-cookie',
        // `sub` carries the observer into the cookie so every later request can
        // be matched against THEIR hold, not against "somebody is watching".
        ...(observing ? { obs: true, sub: verdict.observerUserId } : {}),
      },
      { secret: this.env.SESSION_TOKEN_SECRET, expiresIn: ttl },
    );
    const attrs = [
      `${SESSION_COOKIE}=${cookie}`,
      `Path=${cookiePath(verdict.kasmId, mode, observing)}`,
      `Max-Age=${ttl}`,
      'HttpOnly',
      'Secure',
      `SameSite=${this.env.SESSION_COOKIE_SAMESITE}`,
    ];
    res.setHeader('Set-Cookie', attrs.join('; '));
    // The location has to go out absolute, however much a relative one would
    // prefer to stay that way. Traefik resolves the auth response's Location
    // against the URL it called — `http://api:4000/api/v1/internal/session-auth`
    // — so a relative path came back to the browser as `http://api:4000/session/…`,
    // an internal Docker name that resolves nowhere. Measured on a live install:
    // the browser gave up with ERR_NAME_NOT_RESOLVED and no desktop ever loaded.
    // The host comes from Traefik's own forwarded headers, and the path is the
    // one this gate computed, never one supplied by the caller.
    res.setHeader(
      'Location',
      forwardedHost ? `${forwardedProto || 'https'}://${forwardedHost}${verdict.location}` : verdict.location,
    );
    // 302, not 307: the follow-up must be a GET even if the gated request was
    // not, and the browser must not replay a body it already sent.
    res.status(302).end();
  }
}
