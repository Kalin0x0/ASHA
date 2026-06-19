import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Client } from 'ldapts';
import { prisma } from '@asha/db';
import type { Env } from '@asha/config';
import { unsealConfig } from '../../common/config-seal';
import { ENV } from '../../common/env.module';
import type { FederatedProfile } from './federation.service';

/**
 * LDAP / Active Directory bind + search on top of the open-source `ldapts` (MIT)
 * client. AuthConfig.config for LDAP:
 *   {
 *     url, baseDN, bindDN, bindPassword,
 *     userFilter?  (default "(|(uid={username})(sAMAccountName={username})(mail={username}))"),
 *     emailAttr?   (default "mail"),
 *     nameAttr?    (default "displayName"),
 *     groupAttr?   (default "memberOf"),
 *     tlsRejectUnauthorized? (default true)
 *   }
 */
@Injectable()
export class LdapService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private async loadConfig(orgId: string, id: string) {
    const cfg = await prisma.authConfig.findFirst({ where: { id, orgId, type: 'LDAP' } });
    if (!cfg) throw new NotFoundException('LDAP provider not found');
    const resolved = cfg.secretRef
      ? unsealConfig(cfg.secretRef, this.env.SECRET_SEAL_KEY)
      : (cfg.config as Record<string, unknown>);
    return resolved as unknown as LdapConfig;
  }

  private newClient(c: LdapConfig): Client {
    // Only attach TLS options for ldaps:// — passing them for a plain ldap:// URL
    // makes ldapts attempt a TLS handshake the server rejects ("socket
    // disconnected before secure TLS connection was established").
    const secure = c.url.trim().toLowerCase().startsWith('ldaps://');
    return new Client({
      url: c.url,
      timeout: 8000,
      connectTimeout: 8000,
      ...(secure ? { tlsOptions: { rejectUnauthorized: c.tlsRejectUnauthorized !== false } } : {}),
    });
  }

  /**
   * Live diagnostic: bind with the service account, run the user filter for a
   * sample username (or just confirm the bind), and return what was found.
   * Never throws on "user not found" — that's a valid diagnostic result.
   */
  async test(orgId: string, id: string, sampleUsername?: string) {
    const c = await this.loadConfig(orgId, id);
    const client = this.newClient(c);
    try {
      await client.bind(c.bindDN, c.bindPassword);
      const result: Record<string, unknown> = { bind: 'ok', url: c.url };
      if (sampleUsername) {
        const filter = (c.userFilter ?? DEFAULT_FILTER).replace(/\{username\}/g, escapeFilter(sampleUsername));
        const { searchEntries } = await client.search(c.baseDN, { scope: 'sub', filter, sizeLimit: 1 });
        result.found = searchEntries.length;
        result.dn = searchEntries[0]?.dn;
        result.attributes = searchEntries[0]
          ? Object.keys(searchEntries[0]).filter((k) => k !== 'dn')
          : [];
      }
      return result;
    } catch (e) {
      throw new BadRequestException(`LDAP test failed: ${(e as Error).message}`);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /**
   * Authenticate a user: service-bind → search for the user → re-bind as that
   * user with the supplied password → return a normalized profile.
   */
  async authenticate(orgId: string, id: string, username: string, password: string): Promise<{ orgId: string; profile: FederatedProfile }> {
    const c = await this.loadConfig(orgId, id);
    const client = this.newClient(c);
    try {
      await client.bind(c.bindDN, c.bindPassword);
      const filter = (c.userFilter ?? DEFAULT_FILTER).replace(/\{username\}/g, escapeFilter(username));
      const { searchEntries } = await client.search(c.baseDN, { scope: 'sub', filter, sizeLimit: 1 });
      const entry = searchEntries[0];
      if (!entry) throw new UnauthorizedException('Invalid credentials');

      // Re-bind as the user to verify the password.
      const userClient = this.newClient(c);
      try {
        await userClient.bind(entry.dn, password);
      } catch {
        throw new UnauthorizedException('Invalid credentials');
      } finally {
        await userClient.unbind().catch(() => undefined);
      }

      const emailAttr = c.emailAttr ?? 'mail';
      const nameAttr = c.nameAttr ?? 'displayName';
      const groupAttr = c.groupAttr ?? 'memberOf';
      const email = first(entry[emailAttr]) ?? `${username}@${orgId}`;

      return {
        orgId,
        profile: {
          email,
          username,
          displayName: first(entry[nameAttr]) ?? username,
          attributes: { [groupAttr]: toStringArray(entry[groupAttr]) },
        },
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  /**
   * Bulk directory sync (C3) — service-bind, search all users matching the sync
   * filter, and provision/update the matching Asha users. `dryRun` reports what
   * would happen without writing. Just-in-time login is still handled by
   * authenticate(); this is the up-front provisioning path.
   */
  async sync(orgId: string, id: string, opts: { dryRun?: boolean; filter?: string; limit?: number } = {}) {
    const c = await this.loadConfig(orgId, id);
    const client = this.newClient(c);
    const summary = {
      dryRun: Boolean(opts.dryRun),
      found: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as Array<{ entry: string; error: string }>,
    };
    try {
      await client.bind(c.bindDN, c.bindPassword);
      const filter = opts.filter ?? c.syncFilter ?? '(|(objectClass=person)(objectClass=user)(objectClass=inetOrgPerson))';
      const emailAttr = c.emailAttr ?? 'mail';
      const nameAttr = c.nameAttr ?? 'displayName';
      const { searchEntries } = await client.search(c.baseDN, {
        scope: 'sub',
        filter,
        sizeLimit: Math.min(opts.limit ?? 1000, 5000),
        paged: true,
      });
      summary.found = searchEntries.length;

      for (const entry of searchEntries) {
        const email = first(entry[emailAttr]);
        const username = first(entry.uid) ?? first(entry.sAMAccountName) ?? first(entry.cn) ?? email?.split('@')[0];
        if (!email && !username) {
          summary.skipped += 1;
          continue;
        }
        const finalEmail = (email ?? `${username}@${orgId}`).toLowerCase();
        const finalUsername = (username ?? finalEmail).toLowerCase();
        const displayName = first(entry[nameAttr]) ?? username ?? null;
        if (opts.dryRun) {
          summary.created += 1; // "would create/update"
          continue;
        }
        try {
          const existing = await prisma.user.findFirst({
            where: { orgId, OR: [{ email: finalEmail }, { username: finalUsername }] },
          });
          if (existing) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { displayName: displayName ?? existing.displayName },
            });
            summary.updated += 1;
          } else {
            await prisma.user.create({
              data: { orgId, email: finalEmail, username: finalUsername, displayName, status: 'ACTIVE', isSystemAdmin: false },
            });
            summary.created += 1;
          }
        } catch (e) {
          summary.errors.push({ entry: String(entry.dn), error: (e as Error).message });
        }
      }
      return summary;
    } catch (e) {
      throw new BadRequestException(`LDAP sync failed: ${(e as Error).message}`);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}

interface LdapConfig {
  url: string;
  baseDN: string;
  bindDN: string;
  bindPassword: string;
  userFilter?: string;
  /** Filter for bulk directory sync (default all persons/users). */
  syncFilter?: string;
  emailAttr?: string;
  nameAttr?: string;
  groupAttr?: string;
  tlsRejectUnauthorized?: boolean;
}

const DEFAULT_FILTER = '(|(uid={username})(sAMAccountName={username})(mail={username}))';

/** Escape special chars per RFC 4515 so a username can't inject filter syntax. */
function escapeFilter(input: string): string {
  return input.replace(/[\0()*\\]/g, (ch) => '\\' + ch.charCodeAt(0).toString(16).padStart(2, '0'));
}

function first(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0] != null ? String(v[0]) : undefined;
  return v != null ? String(v) : undefined;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return v != null ? [String(v)] : [];
}
