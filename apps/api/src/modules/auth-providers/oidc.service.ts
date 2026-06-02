import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'crypto';
import type { JsonWebKey, KeyObject } from 'crypto';
import { prisma } from '@chista/db';
import type { FederatedProfile } from './federation.service';

interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  redirectUri?: string;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  /** Escape hatch: skip ID-token signature verification (NOT recommended). */
  skipIdTokenVerification?: boolean;
}

interface DiscoveryDoc {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  jwks_uri: string;
}

/** A JWK as published in a JWKS document, plus the fields we key on. */
interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface PendingState {
  authConfigId: string;
  orgId: string;
  verifier: string;
  nonce: string;
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
  /** Short-lived JWKS cache: jwks_uri → { keys, expiresAt }. */
  private readonly jwksCache = new Map<string, { keys: Jwk[]; expiresAt: number }>();
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

  /** Fetch + cache the IdP's signing keys. */
  private async jwks(jwksUri: string): Promise<Jwk[]> {
    const cached = this.jwksCache.get(jwksUri);
    if (cached && cached.expiresAt > Date.now()) return cached.keys;

    const res = await fetch(jwksUri);
    if (!res.ok) throw new Error(`OIDC JWKS fetch failed: ${res.status} ${jwksUri}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = body.keys ?? [];
    this.jwksCache.set(jwksUri, { keys, expiresAt: Date.now() + 10 * 60_000 });
    return keys;
  }

  /**
   * Verify an ID token's signature against the IdP JWKS and validate the core
   * claims (iss/aud/exp). Returns the decoded payload on success. Supports the
   * standard OIDC algorithms RS256/RS384/RS512 and ES256/ES384/ES512.
   */
  private async verifyIdToken(
    idToken: string,
    cfg: OidcConfig,
    doc: DiscoveryDoc,
  ): Promise<Record<string, unknown>> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Malformed ID token');
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as {
      alg: string;
      kid?: string;
    };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<
      string,
      unknown
    >;

    // Locate the signing key: match on kid when present, else first usable key.
    const keys = await this.jwks(doc.jwks_uri);
    let jwk = header.kid ? keys.find((k) => k.kid === header.kid) : undefined;
    jwk ??= keys.find((k) => (k.use ?? 'sig') === 'sig') ?? keys[0];
    if (!jwk) throw new UnauthorizedException('No matching JWKS key for ID token');

    // Re-fetch once if the kid wasn't found (key rotation): bust the cache.
    if (header.kid && jwk.kid !== header.kid) {
      this.jwksCache.delete(doc.jwks_uri);
      const fresh = await this.jwks(doc.jwks_uri);
      jwk = fresh.find((k) => k.kid === header.kid) ?? jwk;
    }

    const publicKey = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(sigB64, 'base64url');

    if (!verifyJwtSignature(header.alg, signingInput, publicKey, signature)) {
      throw new UnauthorizedException('ID token signature verification failed');
    }

    // ── Claim validation ──────────────────────────────────────────────────────
    const expectedIssuer = doc.issuer ?? cfg.issuer;
    if (payload['iss'] && expectedIssuer && normalizeIssuer(String(payload['iss'])) !== normalizeIssuer(expectedIssuer)) {
      throw new UnauthorizedException('ID token issuer mismatch');
    }
    const aud = payload['aud'];
    const audValid = Array.isArray(aud) ? aud.includes(cfg.clientId) : aud === cfg.clientId;
    if (!audValid) throw new UnauthorizedException('ID token audience mismatch');

    const now = Math.floor(Date.now() / 1000);
    const skew = 120; // 2-minute clock-skew tolerance
    if (typeof payload['exp'] === 'number' && payload['exp'] + skew < now) {
      throw new UnauthorizedException('ID token has expired');
    }
    if (typeof payload['nbf'] === 'number' && payload['nbf'] - skew > now) {
      throw new UnauthorizedException('ID token not yet valid');
    }

    return payload;
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
    // Nonce binds the ID token to this very authorization request, defeating
    // token replay/injection — verified against the id_token `nonce` claim.
    const nonce = randomBytes(16).toString('hex');
    const scopes = cfg.scopes ?? ['openid', 'email', 'profile'];
    const redirectUri = cfg.redirectUri ?? `${process.env.CHISTA_BASE_URL ?? ''}/auth/oidc/${id}/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge: this.challenge(verifier),
      code_challenge_method: 'S256',
    });

    this.pruneStates();
    this.pendingStates.set(state, {
      authConfigId: id,
      orgId,
      verifier,
      nonce,
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

    // ── ID token (signature-verified) ────────────────────────────────────────
    let claims: Record<string, unknown> = {};

    if (tokens.id_token) {
      if (cfg.skipIdTokenVerification) {
        // Opt-out path: decode without verifying (discouraged; for IdPs that
        // don't publish a JWKS). UserInfo is still fetched below as the source.
        try {
          const payload = tokens.id_token.split('.')[1];
          if (payload) claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
        } catch {
          /* fall through to UserInfo */
        }
      } else {
        // Verify the signature against the IdP JWKS and validate iss/aud/exp.
        claims = await this.verifyIdToken(tokens.id_token, cfg, doc);
      }

      // Nonce binding: when the IdP echoes a nonce it MUST match the one we
      // issued for this authorization request (skipped only when unverified).
      if (!cfg.skipIdTokenVerification && claims['nonce'] !== undefined && claims['nonce'] !== pending.nonce) {
        throw new UnauthorizedException('OIDC ID token nonce mismatch');
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

  /**
   * RP-initiated logout (OIDC Session Management). Returns the IdP
   * end_session_endpoint URL to redirect the browser to, so the IdP session is
   * terminated too — not just the local Chista session. Falls back to the local
   * post-logout target when the IdP advertises no end_session_endpoint.
   */
  async logoutUrl(id: string, postLogoutRedirect: string, idTokenHint?: string): Promise<{ url: string }> {
    const { cfg } = await this.loadConfig(id);
    const doc = await this.discover(cfg.issuer);
    if (!doc.end_session_endpoint) return { url: postLogoutRedirect };

    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogoutRedirect,
      client_id: cfg.clientId,
    });
    if (idTokenHint) params.set('id_token_hint', idTokenHint);
    return { url: `${doc.end_session_endpoint}?${params.toString()}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT signature verification helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Issuers are compared ignoring a single trailing slash. */
function normalizeIssuer(iss: string): string {
  return iss.replace(/\/$/, '');
}

/**
 * Verify a JWS signature for the standard OIDC algorithms. RSA (RS*) and RSA-PSS
 * (PS*) use the named hash; EC (ES*) requires the IEEE-P1363 signature encoding.
 */
function verifyJwtSignature(
  alg: string,
  data: Buffer,
  key: KeyObject,
  signature: Buffer,
): boolean {
  switch (alg) {
    case 'RS256':
      return cryptoVerify('RSA-SHA256', data, key, signature);
    case 'RS384':
      return cryptoVerify('RSA-SHA384', data, key, signature);
    case 'RS512':
      return cryptoVerify('RSA-SHA512', data, key, signature);
    case 'PS256':
      return cryptoVerify('sha256', data, { key, padding: 6 /* RSA_PKCS1_PSS_PADDING */ }, signature);
    case 'PS384':
      return cryptoVerify('sha384', data, { key, padding: 6 }, signature);
    case 'PS512':
      return cryptoVerify('sha512', data, { key, padding: 6 }, signature);
    case 'ES256':
      return cryptoVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
    case 'ES384':
      return cryptoVerify('sha384', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
    case 'ES512':
      return cryptoVerify('sha512', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
    default:
      // Reject unknown / 'none' algorithms outright.
      return false;
  }
}
