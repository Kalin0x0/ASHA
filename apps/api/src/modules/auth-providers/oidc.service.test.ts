import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    authConfig: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

// Mock global fetch for discovery + token exchange
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { OidcService } from './oidc.service';

const discoveryDoc = {
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

describe('OidcService', () => {
  let service: OidcService;

  beforeEach(() => {
    service = new OidcService();
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
      }) // token exchange
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

  it('extracts email from ID token payload when UserInfo unavailable', async () => {
    const { state } = await service.authorizationUrl('cfg1');

    const claims = { email: 'from@idtoken.com', sub: 'sub2', name: 'ID User' };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const idToken = `header.${payload}.sig`;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', id_token: idToken }),
        text: async () => '',
      }) // token exchange
      .mockResolvedValueOnce({ ok: false, text: async () => 'error' }); // userinfo fails → fall back to ID token

    const { profile } = await service.handleCallback('cfg1', 'code2', state);
    expect(profile.email).toBe('from@idtoken.com');
  });
});
