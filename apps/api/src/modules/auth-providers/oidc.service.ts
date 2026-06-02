import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@chista/db';
import type { FederatedProfile } from './federation.service';

interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  redirectUri?: string;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
}

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  jwks_uri: string;
}

interface PendingState {
  authConfigId: string;
  orgId: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

/**
 * OIDC Authorization Code + PKCE flow implemented over fetch() with no external
 * library. Supports any OIDC-compliant IdP (Google, Okta, Keycloak, Azure AD, …).
 * Uses the IdP's discovery document (.well-known/openid-configuration).
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger('OIDC');
  /** Short-lived discovery doc cache: issuer → { doc, expiresAt }. */
  private readonly discoveryCache = new Map<string, { doc: DiscoveryDoc; expiresAt: number }>();
  /** In-flight PKCE states: state token → PendingState. */
  private readonly pendingStates = new Map<string, PendingState>();

  private async loadConfig(id: string): Promise<{ cfg: OidcConfig; orgId: string }> {
    const row = await prisma.authConfig.findFirst({ where: { id, type: 'OIDC', enabled: true } });
    if (!row) throw new BadRequestException('OIDC provider not found or disabled');
    return { cfg: row.config as unknown as OidcConfig, orgId: row.orgId };
  }

  private async discover(issuer: string): Promise<DiscoveryDoc> {
    const cached = this.discoveryCache.get(issuer);
    if (cached && cached.expiresAt > Date.now()) return cached.doc;

    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${url}`);
    const doc = (await res.json()) as DiscoveryDoc;
    this.discoveryCache.set(issuer, { doc, expiresAt: Date.now() + 5 * 60_000 });
    return doc;
  }

  /** Generate PKCE code_verifier (43–128 chars, base64url). */
  private generateVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /** SHA-256 PKCE code_challenge from verifier. */
  private challenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /** Prune expired states lazily. */
  private pruneStates() {
    const now = Date.now();
    for (const [k, v] of this.pendingStates) {
      if (v.expiresAt < now) this.pendingStates.delete(k);
    }
  }

  /**
   * Build the authorization redirect URL. Returns `{ url, state }`.
   * The `state` is stored server-side — browsers never need to carry the verifier.
   */
  async authorizationUrl(id: string, returnTo = '/'): Promise<{ url: string; state: string }> {
    const { cfg, orgId } = await this.loadConfig(id);
    const doc = await this.discover(cfg.issuer);

    const verifier = this.generateVerifier();
    const state = randomBytes(16).toString('hex');
    const scopes = cfg.scopes ?? ['openid', 'email', 'profile'];
    const redirectUri = cfg.redirectUri ?? `${process.env.CHISTA_BASE_URL ?? ''}/auth/oidc/${id}/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: this.challenge(verifier),
      code_challenge_method: 'S256',
    });

    this.pruneStates();
    this.pendingStates.set(state, {
      authConfigId: id,
      orgId,
      verifier,
      returnTo,
      expiresAt: Date.now() + 10 * 60_000,
    });

    return { url: `${doc.authorization_endpoint}?${params.toString()}`, state };
  }

  /**
   * Exchange the authorization code for tokens, fetch UserInfo, return a
   * FederatedProfile for JIT provisioning.
   */
  async handleCallback(
    id: string,
    code: string,
    state: string,
  ): Promise<{ orgId: string; profile: FederatedProfile; returnTo: string }> {
    const pending = this.pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired OIDC state');
    }
    if (pending.authConfigId !== id) {
      throw new UnauthorizedException('OIDC state mismatch');
    }
    this.pendingStates.delete(state);

    const { cfg } = await this.loadConfig(id);
    const doc = await this.discover(cfg.issuer);
    const redirectUri = cfg.redirectUri ?? `${process.env.CHISTA_BASE_URL ?? ''}/auth/oidc/${id}/callback`;
    const authMethod = cfg.tokenEndpointAuthMethod ?? 'client_secret_basic';

    // ── Token exchange ──────────────────────────────────────────────────────
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: pending.verifier,
      ...(authMethod === 'client_secret_post' && cfg.clientSecret
        ? { client_id: cfg.clientId, client_secret: cfg.clientSecret }
        : {}),
    });

    const tokenHeaders: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (authMethod === 'client_secret_basic' && cfg.clientSecret) {
      tokenHeaders['Authorization'] =
        `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
    }

    const tokenRes = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers: tokenHeaders,
      body: tokenBody.toString(),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      this.logger.error(`OIDC token exchange failed: ${err}`);
      throw new UnauthorizedException('OIDC token exchange failed');
    }
    const tokens = (await tokenRes.json()) as { access_token: string; id_token?: string };

    // ── UserInfo ────────────────────────────────────────────────────────────
    let claims: Record<string, unknown> = {};

    if (tokens.id_token) {
      // Decode the ID token payload (without signature verification here —
      // production deployments should verify via JWKS; that's a future hardening).
      try {
        const payload = tokens.id_token.split('.')[1];
        if (payload) claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
      } catch {
        // fallback to UserInfo
      }
    }

    if (doc.userinfo_endpoint) {
      try {
        const uiRes = await fetch(doc.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (uiRes.ok) {
          const ui = (await uiRes.json()) as Record<string, unknown>;
          claims = { ...claims, ...ui };
        }
      } catch {
        /* use ID token claims as fallback */
      }
    }

    const email = (claims['email'] as string | undefined) ?? (claims['sub'] as string);
    if (!email) throw new UnauthorizedException('OIDC: no email claim in ID token or UserInfo');

    // Map flat string claims + array groups to FederatedProfile.attributes
    const attributes: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(claims)) {
      if (typeof v === 'string') attributes[k] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string'))
        attributes[k] = v as string[];
    }

    const profile: FederatedProfile = {
      email,
      username: (claims['preferred_username'] as string | undefined) ?? email,
      displayName: (claims['name'] as string | undefined) ?? undefined,
      attributes,
    };

    return { orgId: pending.orgId, profile, returnTo: pending.returnTo };
  }
}
