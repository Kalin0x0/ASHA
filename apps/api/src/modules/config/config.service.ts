import { Injectable } from '@nestjs/common';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';

type Item = Record<string, unknown>;
export interface ConfigSnapshot {
  version?: number;
  volumeMappings?: Item[];
  fileMappings?: Item[];
  groups?: Item[];
}

const s = (v: unknown): string => String(v ?? '');
const sn = (v: unknown): string | null => (v == null ? null : String(v));
const nn = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

/**
 * Org configuration backup / migration (G1). Exports the portable, org-scoped
 * config as a versioned JSON and re-imports it idempotently (existing records,
 * matched by name, are skipped — never overwritten). Roles are exported for
 * inventory but NOT imported (creating roles/permissions from an uploaded file
 * is a privilege-grant surface — kept out of the import path on purpose).
 */
@Injectable()
export class OrgConfigService {
  constructor(private readonly audit: AuditService) {}

  async export(orgId: string) {
    const [volumeMappings, fileMappings, groups, roles] = await Promise.all([
      prisma.volumeMapping.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
      prisma.fileMapping.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
      prisma.group.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
      prisma.role.findMany({ where: { OR: [{ orgId }, { orgId: null }] }, orderBy: { name: 'asc' } }),
    ]);
    return {
      version: 1,
      kind: 'asha-org-config',
      counts: { volumeMappings: volumeMappings.length, fileMappings: fileMappings.length, groups: groups.length },
      volumeMappings: volumeMappings.map((m) => ({
        name: m.name,
        hostPath: m.hostPath,
        destPath: m.destPath,
        readOnly: m.readOnly,
        raw: m.raw,
      })),
      fileMappings: fileMappings.map((m) => ({
        name: m.name,
        target: m.target,
        sourcePath: m.sourcePath,
        destPath: m.destPath,
        owner: m.owner,
        group: m.group,
        mode: m.mode,
        isHomeProfile: m.isHomeProfile,
        scope: m.scope,
      })),
      groups: groups.map((g) => ({
        name: g.name,
        description: g.description,
        priority: g.priority,
        keepaliveExpirationSec: g.keepaliveExpirationSec,
        idleDisconnectSec: g.idleDisconnectSec,
        usageLimitSec: g.usageLimitSec,
        maxConcurrentSessions: g.maxConcurrentSessions,
      })),
      // Inventory only — not consumed by import().
      roles: roles.map((r) => ({ name: r.name, system: r.orgId === null })),
    };
  }

  async import(orgId: string, actorUserId: string, snapshot: ConfigSnapshot) {
    const summary = {
      volumeMappings: { created: 0, skipped: 0 },
      fileMappings: { created: 0, skipped: 0 },
      groups: { created: 0, skipped: 0 },
    };

    for (const m of snapshot.volumeMappings ?? []) {
      const name = s(m.name);
      if (!name) continue;
      if (await prisma.volumeMapping.findFirst({ where: { orgId, name } })) {
        summary.volumeMappings.skipped += 1;
        continue;
      }
      await prisma.volumeMapping.create({
        data: {
          orgId,
          name,
          hostPath: s(m.hostPath),
          destPath: s(m.destPath),
          readOnly: Boolean(m.readOnly),
          raw: (m.raw ?? {}) as object,
        },
      });
      summary.volumeMappings.created += 1;
    }

    for (const m of snapshot.fileMappings ?? []) {
      const name = s(m.name);
      if (!name) continue;
      if (await prisma.fileMapping.findFirst({ where: { orgId, name } })) {
        summary.fileMappings.skipped += 1;
        continue;
      }
      await prisma.fileMapping.create({
        data: {
          orgId,
          name,
          target: (m.target === 'WINDOWS' ? 'WINDOWS' : 'CONTAINER') as never,
          sourcePath: s(m.sourcePath),
          destPath: s(m.destPath),
          owner: sn(m.owner),
          group: sn(m.group),
          mode: sn(m.mode),
          isHomeProfile: Boolean(m.isHomeProfile),
          scope: ((['USER', 'GROUP', 'WORKSPACE'].includes(s(m.scope)) ? m.scope : 'WORKSPACE') as never),
        },
      });
      summary.fileMappings.created += 1;
    }

    for (const g of snapshot.groups ?? []) {
      const name = s(g.name);
      if (!name) continue;
      if (await prisma.group.findFirst({ where: { orgId, name } })) {
        summary.groups.skipped += 1;
        continue;
      }
      await prisma.group.create({
        data: {
          orgId,
          name,
          description: sn(g.description),
          priority: Number(g.priority ?? 100),
          keepaliveExpirationSec: nn(g.keepaliveExpirationSec),
          idleDisconnectSec: nn(g.idleDisconnectSec),
          usageLimitSec: nn(g.usageLimitSec),
          maxConcurrentSessions: nn(g.maxConcurrentSessions),
        },
      });
      summary.groups.created += 1;
    }

    await this.audit.record({
      orgId,
      actorUserId,
      action: 'config.import',
      targetType: 'Org',
      targetId: orgId,
      metadata: summary as unknown as Record<string, unknown>,
    });
    return summary;
  }
}
