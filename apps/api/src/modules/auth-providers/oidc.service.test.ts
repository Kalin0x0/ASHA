import 'reflect-metadata';
import { createSign, generateKeyPairSync, type KeyObject } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    authConfig: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

// Mock global fetch for discovery + token exchange + JWKS + userinfo
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { OidcService } from './oidc.service';

const env = { SECRET_SEAL_KEY: '0123456789abcdef0123456789abcdef' } as never;

// ── Real RSA keypair so we exercise the JWKS signature-verification path ──────
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';

function publicJwk(key: KeyObject) {
  const jwk = key.export({ format: 'jwk' }) as Record<string, unknown>;
  return { ...jwk, kid: KID, alg: 'RS256', use: 'sig' };
}

/** Sign a real RS256 ID token for the given claims. */
function signIdToken(claims: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const seg = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${seg(header)}.${seg(claims)}`;
  const sig = createSign('RSA-SHA256').update(signingInput).sign(privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

const discoveryDoc = {
  issuer: 'https://idp.example.com',
  authorization_endpoint: 'https://idp.example.com/auth',
  token_endpoint: 'https://idp.example.com/token',
  userinfo_endpoint: 'https://idp.example.com/userinfo',
  jwks_uri: 'https://idp.example.com/jwks',
};

const authConfig = {
  id: 'cfg1',
  orgId: 'org1',
  type: 'OIDC',
  enabled: true,
  config: {
    issuer: 'https://idp.example.com',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    scopes: ['openid', 'email', 'profile'],
  },
};

const jwksResponse = { ok: true, json: async () => ({ keys: [publicJwk(publicKey)] }), text: async () => '' };

function standardClaims(extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: 'https://idp.example.com', aud: 'client-id', exp: now + 3600, iat: now, sub: 'sub1', ...extra };
}

describe('OidcService', () => {
  let service: OidcService;

  beforeEach(() => {
    service = new OidcService(env);
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => discoveryDoc,
      text: async () => '',
    });
    prismaMock.authConfig.findFirst.mockResolvedValue(authConfig);
  });

  it('generates authorization URL with PKCE parameters', async () => {
    const { url, state } = await service.authorizationUrl('cfg1', '/dashboard');
    expect(url).toContain('https://idp.example.com/auth');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('response_type=code');
    expect(state).toHaveLength(32);
  });

  it('includes scopes and client_id in authorization URL', async () => {
    const { url } = await service.authorizationUrl('cfg1');
    expect(url).toContain('client_id=client-id');
    expect(url).toContain('scope=openid');
  });

  it('throws on unknown provider', async () => {
    prismaMock.authConfig.findFirst.mockResolvedValue(null);
    await expect(service.authorizationUrl('unknown')).rejects.toThrow();
  });

  it('rejects callback with invalid state', async () => {
    await expect(service.handleCallback('cfg1', 'code', 'invalid-state')).rejects.toThrow(
      /Invalid or expired OIDC state/,
    );
  });

  it('exchanges code and extracts profile from UserInfo', async () => {
    // discovery is cached after authorizationUrl; subsequent fetches are token + userinfo
    const { state } = await service.authorizationUrl('cfg1', '/app');

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok' }),
        text: async () => '',
      }) // token exchange (no id_token → straight to UserInfo)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: 'user@example.com', name: 'Test User', sub: 'sub1' }),
        text: async () => '',
      }); // userinfo

    const { orgId, profile, returnTo } = await service.handleCallback('cfg1', 'auth-code', state);
    expect(orgId).toBe('org1');
    expect(profile.email).toBe('user@example.com');
    expect(profile.displayName).toBe('Test User');
    expect(returnTo).toBe('/app');
  });

  it('verifies a signed ID token via JWKS and extracts claims', async () => {
    const { url, state } = await service.authorizationUrl('cfg1');
    // A compliant IdP echoes the nonce we sent; include it so the binding check passes.
    const nonce = new URL(url).searchParams.get('nonce')!;
    const idToken = signIdToken(standardClaims({ email: 'from@idtoken.com', name: 'ID User', nonce }));

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', id_token: idToken }),
        text: async () => '',
      }) // token exchange
      .mockResolvedValueOnce(jwksResponse) // JWKS fetch for verification
      .mockResolvedValueOnce({ ok: false, text: async () => 'error' }); // userinfo unavailable

    const { profile } = await service.handleCallback('cfg1', 'code2', state);
    expect(profile.email).toBe('from@idtoken.com');
    expect(profile.displayName).toBe('ID User');
  });

  it('accepts an ID token whose nonce matches the authorization request', async () => {
    const { url, state } = await service.authorizationUrl('cfg1');
    const nonce = new URL(url).searchParams.get('nonce')!;
    const idToken = signIdToken(standardClaims({ email: 'n@idtoken.com', nonce }));

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', id_token: idToken }), text: async () => '' })
      .mockResolvedValueOnce(jwksResponse)
      .mockResolvedValueOnce({ ok: false, text: async () => 'error' });

    const { profile } = await service.handleCallback('cfg1', 'code-nonce', state);
    expect(profile.email).toBe('n@idtoken.com');
  });

  it('rejects an ID token whose nonce does not match', async () => {
    const { state } = await service.authorizationUrl('cfg1');
    const idToken = signIdToken(standardClaims({ email: 'n@idtoken.com', nonce: 'attacker-nonce' }));

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', id_token: idToken }), text: async () => '' })
      .mockResolvedValueOnce(jwksResponse);

    await expect(service.handleCallback('cfg1', 'code-bad-nonce', state)).rejects.toThrow(/nonce mismatch/i);
  });

  it('rejects an ID token with a tampered signature', async () => {
    const { state } = await service.authorizationUrl('cfg1');
    const good = signIdToken(standardClaims({ email: 'x@y.com' }));
    // Flip the payload but keep the original signature → verification must fail.
    const [h, , s] = good.split('.');
    const forgedPayload = Buffer.from(JSON.stringify(standardClaims({ email: 'attacker@evil.com' }))).toString('base64url');
    const tampered = `${h}.${forgedPayload}.${s}`;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', id_token: tampered }),
        text: async () => '',
      })
      .mockResolvedValueOnce(jwksResponse);

    await expect(service.handleCallback('cfg1', 'code3', state)).rejects.toThrow(/signature verification failed/);
  });

  it('rejects an ID token with the wrong audience', async () => {
    const { state } = await service.authorizationUrl('cfg1');
    const idToken = signIdToken(standardClaims({ aud: 'someone-else', email: 'a@b.com' }));

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', id_token: idToken }),
        text: async () => '',
      })
      .mockResolvedValueOnce(jwksResponse);

    await expect(service.handleCallback('cfg1', 'code4', state)).rejects.toThrow(/audience mismatch/);
  });

  it('skips verification when skipIdTokenVerification is set', async () => {
    prismaMock.authConfig.findFirst.mockResolvedValue({
      ...authConfig,
      config: { ...authConfig.config, skipIdTokenVerification: true },
    });
    const { state } = await service.authorizationUrl('cfg1');

    // Unsigned token; no JWKS fetch should occur.
    const claims = { email: 'unverified@idtoken.com', sub: 's' };
    const idToken = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', id_token: idToken }),
        text: async () => '',
      })
      .mockResolvedValueOnce({ ok: false, text: async () => 'error' }); // userinfo fails

    const { profile } = await service.handleCallback('cfg1', 'code5', state);
    expect(profile.email).toBe('unverified@idtoken.com');
  });
});
