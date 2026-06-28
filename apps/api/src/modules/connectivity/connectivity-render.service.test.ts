import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    webFilterConfig: { findFirst: vi.fn() },
    egressGateway: { findFirst: vi.fn() },
    browserIsolationConfig: { findFirst: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ConnectivityRenderService } from './connectivity-render.service';

describe('ConnectivityRenderService', () => {
  let svc: ConnectivityRenderService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ConnectivityRenderService();
  });

  // ── Squid ──────────────────────────────────────────────────────────────

  it('renders a Squid whitelist config that denies all but allowed domains', async () => {
    prismaMock.webFilterConfig.findFirst.mockResolvedValue({
      name: 'corp',
      cacheTtl: 1800,
      categories: { allowedDomains: ['example.com'], blockedDomains: ['evil.com'], safeSearch: true },
    });
    const { filename, content } = await svc.renderSquidConfig('org1', 'f1');
    expect(filename).toBe('squid-corp.conf');
    expect(content).toContain('negative_ttl 1800 seconds');
    expect(content).toContain('acl allowed_domains dstdomain .example.com');
    expect(content).toContain('acl blocked_domains dstdomain .evil.com');
    expect(content).toContain('http_access deny blocked_domains');
    expect(content).toContain('http_access allow allowed_domains');
    expect(content).toContain('http_access deny all');
  });

  it('renders allow-all Squid when no whitelist is set', async () => {
    prismaMock.webFilterConfig.findFirst.mockResolvedValue({ name: 'open', cacheTtl: 3600, categories: {} });
    const { content } = await svc.renderSquidConfig('org1', 'f1');
    expect(content).toContain('http_access allow all');
  });

  it('throws when the web filter is missing', async () => {
    prismaMock.webFilterConfig.findFirst.mockResolvedValue(null);
    await expect(svc.renderSquidConfig('org1', 'missing')).rejects.toThrow(NotFoundException);
  });

  // ── WireGuard ──────────────────────────────────────────────────────────

  it('renders a WireGuard config with interface + peer sections', async () => {
    prismaMock.egressGateway.findFirst.mockResolvedValue({
      name: 'eu-exit',
      provider: 'wireguard',
      config: {
        address: '10.0.0.2/32',
        privateKey: 'PRIV',
        peerPublicKey: 'PUB',
        peerEndpoint: 'vpn.example.com:51820',
        dns: '1.1.1.1',
      },
    });
    const { filename, content } = await svc.renderWireGuardConfig('org1', 'e1');
    expect(filename).toBe('wg-eu-exit.conf');
    expect(content).toContain('[Interface]');
    expect(content).toContain('Address = 10.0.0.2/32');
    expect(content).toContain('DNS = 1.1.1.1');
    expect(content).toContain('[Peer]');
    expect(content).toContain('Endpoint = vpn.example.com:51820');
    expect(content).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
  });

  it('rejects a non-WireGuard egress provider', async () => {
    prismaMock.egressGateway.findFirst.mockResolvedValue({ name: 'x', provider: 'tailscale', config: {} });
    await expect(svc.renderWireGuardConfig('org1', 'e1')).rejects.toThrow(BadRequestException);
  });

  it('rejects a WireGuard config missing required keys', async () => {
    prismaMock.egressGateway.findFirst.mockResolvedValue({
      name: 'incomplete',
      provider: 'wireguard',
      config: { address: '10.0.0.2/32' },
    });
    await expect(svc.renderWireGuardConfig('org1', 'e1')).rejects.toThrow(BadRequestException);
  });

  // ── Neko (browser isolation) ───────────────────────────────────────────

  it('renders a Neko compose service with proxy + screen settings', async () => {
    prismaMock.browserIsolationConfig.findFirst.mockResolvedValue({
      name: 'kiosk',
      forwardProxy: 'http://squid:3128',
      config: { image: 'ghcr.io/m1k1o/neko/firefox:latest', screenWidth: 1920, screenHeight: 1080, fps: 60 },
    });
    const { filename, content } = await svc.renderIsolationCompose('org1', 'i1');
    expect(filename).toBe('neko-kiosk.compose.yml');
    expect(content).toContain('image: ghcr.io/m1k1o/neko/firefox:latest');
    expect(content).toContain('NEKO_DESKTOP_SCREEN: 1920x1080@60');
    expect(content).toContain('http_proxy: http://squid:3128');
  });

  it('falls back to default Neko image + screen when config is empty', async () => {
    prismaMock.browserIsolationConfig.findFirst.mockResolvedValue({ name: 'def', forwardProxy: null, config: {} });
    const { content } = await svc.renderIsolationCompose('org1', 'i1');
    expect(content).toContain('image: ghcr.io/m1k1o/neko/chromium:latest');
    expect(content).toContain('NEKO_DESKTOP_SCREEN: 1280x720@30');
    expect(content).not.toContain('http_proxy');
  });

  // ── F1 deny-by-default + safe-search ───────────────────────────────────

  it('F1: explicit denyByDefault with no allowlist denies all (lockdown)', async () => {
    prismaMock.webFilterConfig.findFirst.mockResolvedValue({ name: 'lock', cacheTtl: 60, categories: { denyByDefault: true } });
    const { content } = await svc.renderSquidConfig('org1', 'f1');
    expect(content).toContain('http_access deny all');
    expect(content).not.toContain('http_access allow all');
  });

  it('F1: safeSearch injects the X-Asha-SafeSearch enforcement header', async () => {
    prismaMock.webFilterConfig.findFirst.mockResolvedValue({ name: 's', cacheTtl: 60, categories: { safeSearch: true } });
    const { content } = await svc.renderSquidConfig('org1', 'f1');
    expect(content).toContain('X-Asha-SafeSearch');
    expect(content).toContain('.duckduckgo.com');
  });

  // ── F3 OpenVPN ─────────────────────────────────────────────────────────

  it('F3: renders a valid .ovpn from an openvpn egress', async () => {
    prismaMock.egressGateway.findFirst.mockResolvedValue({
      name: 'vpn',
      provider: 'openvpn',
      config: { remoteHost: 'vpn.example.com', remotePort: 1194, proto: 'udp', ca: 'CA-PEM', authUser: 'u' },
    });
    const { filename, content } = await svc.renderOpenVpnConfig('org1', 'e1');
    expect(filename).toBe('openvpn-vpn.conf');
    expect(content).toContain('client');
    expect(content).toContain('remote vpn.example.com 1194');
    expect(content).toContain('proto udp');
    expect(content).toContain('<ca>');
    expect(content).toContain('CA-PEM');
    expect(content).toContain('auth-user-pass');
  });

  it('F3: rejects a non-openvpn provider', async () => {
    prismaMock.egressGateway.findFirst.mockResolvedValue({ name: 'wg', provider: 'wireguard', config: {} });
    await expect(svc.renderOpenVpnConfig('org1', 'e1')).rejects.toThrow(BadRequestException);
  });

  it('F3: rejects missing required openvpn fields', async () => {
    prismaMock.egressGateway.findFirst.mockResolvedValue({ name: 'bad', provider: 'openvpn', config: { remoteHost: 'h' } });
    await expect(svc.renderOpenVpnConfig('org1', 'e1')).rejects.toThrow(/missing "ca"/);
  });
});
