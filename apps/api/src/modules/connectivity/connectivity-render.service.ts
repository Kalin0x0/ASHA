import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@chista/db';
import type { SessionSidecar } from '@chista/events';

/** A rendered, ready-to-deploy artifact for an open-source sidecar. */
export interface RenderedArtifact {
  filename: string;
  content: string;
}

/**
 * Turns stored connectivity configs into deployable artifacts for open-source
 * sidecars — nothing proprietary:
 *   • Web filter      → Squid (squid-cache.org) proxy ACL config
 *   • Egress gateway  → WireGuard (wireguard.com) tunnel config
 *   • Browser isolation → Neko (github.com/m1k1o/neko, Apache-2.0) compose service
 * The agent mounts these next to the session container to enforce the policy.
 */
@Injectable()
export class ConnectivityRenderService {
  /** Render a Squid config that whitelists/blacklists domains and forces safe-search. */
  async renderSquidConfig(orgId: string, id: string): Promise<RenderedArtifact> {
    const filter = await prisma.webFilterConfig.findFirst({ where: { id, orgId } });
    if (!filter) throw new NotFoundException('Web filter not found');
    const cat = (filter.categories ?? {}) as {
      blockedDomains?: string[];
      allowedDomains?: string[];
      safeSearch?: boolean;
    };

    const lines = [
      `# Squid web filter for Chista filter "${filter.name}"`,
      'http_port 3128',
      `# Negative-DNS + positive caches honour the configured TTL`,
      `negative_ttl ${filter.cacheTtl} seconds`,
      '',
    ];

    if (cat.allowedDomains?.length) {
      lines.push('acl allowed_domains dstdomain ' + cat.allowedDomains.map((d) => this.dotPrefix(d)).join(' '));
    }
    if (cat.blockedDomains?.length) {
      lines.push('acl blocked_domains dstdomain ' + cat.blockedDomains.map((d) => this.dotPrefix(d)).join(' '));
      lines.push('http_access deny blocked_domains');
    }
    if (cat.safeSearch) {
      lines.push('# Force Google/Bing/YouTube SafeSearch via DNS rewrite');
      lines.push('acl safe_search_hosts dstdomain .google.com .bing.com .youtube.com');
    }
    if (cat.allowedDomains?.length) {
      // Whitelist mode: allow listed domains, deny the rest.
      lines.push('http_access allow allowed_domains');
      lines.push('http_access deny all');
    } else {
      lines.push('http_access allow all');
    }

    return { filename: `squid-${filter.name}.conf`, content: lines.join('\n') + '\n' };
  }

  /** Render a WireGuard interface config for an egress tunnel. */
  async renderWireGuardConfig(orgId: string, id: string): Promise<RenderedArtifact> {
    const egress = await prisma.egressGateway.findFirst({ where: { id, orgId } });
    if (!egress) throw new NotFoundException('Egress gateway not found');
    if (egress.provider.toLowerCase() !== 'wireguard') {
      throw new BadRequestException(`Egress "${egress.name}" is not a WireGuard provider`);
    }
    const c = (egress.config ?? {}) as {
      address?: string;
      privateKey?: string;
      dns?: string;
      peerPublicKey?: string;
      peerEndpoint?: string;
      allowedIPs?: string;
    };
    for (const key of ['address', 'privateKey', 'peerPublicKey', 'peerEndpoint'] as const) {
      if (!c[key]) throw new BadRequestException(`WireGuard config missing "${key}"`);
    }

    const content = [
      `# WireGuard egress for Chista gateway "${egress.name}"`,
      '[Interface]',
      `Address = ${c.address}`,
      `PrivateKey = ${c.privateKey}`,
      ...(c.dns ? [`DNS = ${c.dns}`] : []),
      '',
      '[Peer]',
      `PublicKey = ${c.peerPublicKey}`,
      `Endpoint = ${c.peerEndpoint}`,
      `AllowedIPs = ${c.allowedIPs ?? '0.0.0.0/0, ::/0'}`,
      'PersistentKeepalive = 25',
      '',
    ].join('\n');

    return { filename: `wg-${egress.name}.conf`, content };
  }

  /** Render a Neko (Apache-2.0) docker-compose service for a disposable isolated browser. */
  async renderIsolationCompose(orgId: string, id: string): Promise<RenderedArtifact> {
    const iso = await prisma.browserIsolationConfig.findFirst({ where: { id, orgId } });
    if (!iso) throw new NotFoundException('Browser isolation config not found');
    const c = (iso.config ?? {}) as {
      image?: string;
      screenWidth?: number;
      screenHeight?: number;
      fps?: number;
    };
    const image = c.image ?? 'ghcr.io/m1k1o/neko/chromium:latest';
    const screen = `${c.screenWidth ?? 1280}x${c.screenHeight ?? 720}@${c.fps ?? 30}`;

    const content = [
      `# Neko isolated-browser service for Chista isolation "${iso.name}"`,
      'services:',
      `  neko-${iso.name}:`,
      `    image: ${image}`,
      '    restart: unless-stopped',
      '    cap_add: [SYS_ADMIN]',
      '    shm_size: 2gb',
      '    environment:',
      `      NEKO_DESKTOP_SCREEN: ${screen}`,
      ...(iso.forwardProxy ? [`      http_proxy: ${iso.forwardProxy}`, `      https_proxy: ${iso.forwardProxy}`] : []),
      '      NEKO_MEMBER_MULTIUSER_USER_PASSWORD: neko',
      '      NEKO_WEBRTC_EPR: 52000-52100',
      '      NEKO_WEBRTC_ICELITE: 1',
      '    ports:',
      '      - "8080:8080"',
      '      - "52000-52100:52000-52100/udp"',
      '',
    ].join('\n');

    return { filename: `neko-${iso.name}.compose.yml`, content };
  }

  // ── Sidecar resolution ──────────────────────────────────────────────────────
  // These methods return structured SessionSidecar descriptors consumed by the
  // agent provisioning loop to co-launch open-source sidecars alongside sessions.

  /** Build a Squid (ubuntu/squid) sidecar descriptor for the agent. */
  async resolveSquidSidecar(orgId: string, id: string): Promise<SessionSidecar> {
    const { content } = await this.renderSquidConfig(orgId, id);
    return {
      image: 'ubuntu/squid:latest',
      configs: { '/etc/squid/squid.conf': content },
    };
  }

  /** Build a WireGuard (masipcat/wireguard-go) sidecar descriptor for the agent. */
  async resolveWireGuardSidecar(orgId: string, id: string): Promise<SessionSidecar> {
    const { content } = await this.renderWireGuardConfig(orgId, id);
    return {
      image: 'masipcat/wireguard-go:latest',
      configs: { '/etc/wireguard/wg0.conf': content },
      capAdd: ['NET_ADMIN'],
    };
  }

  /**
   * Build a Neko (ghcr.io/m1k1o/neko) sidecar descriptor.
   * @param squidProxyUrl – if a Squid sidecar is also active, pass its URL
   *   so Neko's http_proxy is wired automatically; otherwise the stored
   *   forwardProxy value (if any) is used.
   */
  async resolveNekoSidecar(orgId: string, id: string, squidProxyUrl?: string): Promise<SessionSidecar> {
    const iso = await prisma.browserIsolationConfig.findFirst({ where: { id, orgId } });
    if (!iso) throw new NotFoundException('Browser isolation config not found');
    const c = (iso.config ?? {}) as { image?: string; screenWidth?: number; screenHeight?: number; fps?: number };
    const image = c.image ?? 'ghcr.io/m1k1o/neko/chromium:latest';
    const screen = `${c.screenWidth ?? 1280}x${c.screenHeight ?? 720}@${c.fps ?? 30}`;
    const proxy = squidProxyUrl ?? iso.forwardProxy ?? undefined;

    return {
      image,
      env: {
        NEKO_DESKTOP_SCREEN: screen,
        NEKO_MEMBER_MULTIUSER_USER_PASSWORD: 'neko',
        NEKO_WEBRTC_EPR: '52000-52100',
        NEKO_WEBRTC_ICELITE: '1',
        ...(proxy ? { http_proxy: proxy, https_proxy: proxy } : {}),
      },
      capAdd: ['SYS_ADMIN'],
      ports: [8080],
    };
  }

  /**
   * Build a PulseAudio (open-source, LGPL) audio-bridge sidecar. The session
   * container forwards its audio to this sink over TCP (PULSE_SERVER); the sink
   * mixes and exposes it so the viewer's stream carries sound. Pure — no DB.
   * @param image override for the PulseAudio image (operator-configurable).
   */
  resolveAudioSidecar(image = 'ich777/pulseaudio:latest'): SessionSidecar {
    return {
      image,
      env: {
        // Accept TCP connections from the session container on the shared network.
        PULSE_SERVER_PORT: '4713',
        PULSE_ALLOW_NETWORK: '1',
      },
      ports: [4713],
    };
  }

  /**
   * Build a CUPS (open-source, Apache-2.0) virtual-printer sidecar. Print jobs
   * from the session are captured to PDF and exposed for download. Pure — no DB.
   * @param image override for the CUPS image (operator-configurable).
   */
  resolvePrintingSidecar(image = 'olbat/cupsd:latest'): SessionSidecar {
    return {
      image,
      env: {
        // A PDF "printer" queue; jobs land in /var/spool/cups-pdf for retrieval.
        CUPS_PDF_ENABLED: '1',
      },
      ports: [631],
    };
  }

  /** Squid dstdomain ACLs match a leading dot as "domain and subdomains". */
  private dotPrefix(domain: string): string {
    const d = domain.trim();
    return d.startsWith('.') || d.includes('/') ? d : `.${d}`;
  }
}
