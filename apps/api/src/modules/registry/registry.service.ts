import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateRegistryDto,
  InstallRegistryEntryDto,
  UpdateRegistryDto,
} from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Image-registry management + workspace marketplace. A Registry points at a
 * Chista-compatible workspace catalog (a JSON index of installable images, the
 * same open format Kasm-style registries publish). Syncing pulls the index into
 * RegistryEntry rows; installing an entry materialises an Image (and optionally
 * a ready-to-launch Workspace).
 */
@Injectable()
export class RegistryService {
  constructor(private readonly audit: AuditService) {}

  // ── Registries ────────────────────────────────────────────────────────────
  listRegistries(orgId: string) {
    return prisma.registry.findMany({
      where: { OR: [{ orgId }, { orgId: null }] },
      orderBy: { name: 'asc' },
      include: { _count: { select: { entries: true } } },
    });
  }

  async createRegistry(orgId: string, actorUserId: string, dto: CreateRegistryDto) {
    const registry = await prisma.registry.create({
      data: { orgId, name: dto.name, url: dto.url, type: dto.type, enabled: dto.enabled },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'registry.create',
      targetType: 'Registry',
      targetId: registry.id,
      metadata: { url: dto.url },
    });
    return registry;
  }

  async updateRegistry(orgId: string, actorUserId: string, id: string, dto: UpdateRegistryDto) {
    const res = await prisma.registry.updateMany({ where: { id, orgId }, data: dto });
    if (res.count === 0) throw new NotFoundException('Registry not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'registry.update',
      targetType: 'Registry',
      targetId: id,
      metadata: {},
    });
    return prisma.registry.findUnique({ where: { id } });
  }

  async removeRegistry(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.registry.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Registry not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'registry.delete',
      targetType: 'Registry',
      targetId: id,
      metadata: {},
    });
    return { ok: true };
  }

  /**
   * Fetch the registry's JSON index and upsert its entries. The index is an
   * array of `{ name, friendlyName, description, dockerImage, iconUrl, categories }`.
   */
  async syncRegistry(orgId: string, actorUserId: string, id: string) {
    const registry = await prisma.registry.findFirst({ where: { id, OR: [{ orgId }, { orgId: null }] } });
    if (!registry) throw new NotFoundException('Registry not found');

    let items: RegistryIndexItem[];
    try {
      const res = await fetch(registry.url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`registry index → ${res.status}`);
      const body = (await res.json()) as unknown;
      items = normalizeIndex(body);
    } catch (e) {
      throw new BadRequestException(`Registry sync failed: ${(e as Error).message}`);
    }

    let upserted = 0;
    for (const item of items) {
      if (!item.name || !item.dockerImage) continue;
      const existing = await prisma.registryEntry.findFirst({
        where: { registryId: id, name: item.name },
      });
      const data = {
        registryId: id,
        name: item.name,
        friendlyName: item.friendlyName ?? item.name,
        description: item.description ?? null,
        dockerImage: item.dockerImage,
        iconUrl: item.iconUrl ?? null,
        categories: item.categories ?? [],
        raw: item as object,
      };
      if (existing) await prisma.registryEntry.update({ where: { id: existing.id }, data });
      else await prisma.registryEntry.create({ data });
      upserted += 1;
    }

    await prisma.registry.update({ where: { id }, data: { lastSyncedAt: new Date() } });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'registry.sync',
      targetType: 'Registry',
      targetId: id,
      metadata: { upserted },
    });
    return { ok: true, upserted };
  }

  // ── Marketplace (entries) ─────────────────────────────────────────────────
  /** All installable entries across the org's registries — the marketplace feed. */
  marketplace(orgId: string, query?: string) {
    const q = query?.trim().toLowerCase();
    return prisma.registryEntry
      .findMany({
        where: { registry: { OR: [{ orgId }, { orgId: null }] } },
        orderBy: { friendlyName: 'asc' },
        include: { registry: { select: { name: true, type: true } } },
      })
      .then((entries) =>
        q
          ? entries.filter(
              (e) =>
                e.friendlyName.toLowerCase().includes(q) ||
                e.name.toLowerCase().includes(q) ||
                (e.description ?? '').toLowerCase().includes(q) ||
                e.categories.some((c) => c.toLowerCase().includes(q)),
            )
          : entries,
      );
  }

  /** Materialise a registry entry into an Image (and optionally a Workspace). */
  async install(orgId: string, actorUserId: string, entryId: string, dto: InstallRegistryEntryDto) {
    const entry = await prisma.registryEntry.findFirst({
      where: { id: entryId, registry: { OR: [{ orgId }, { orgId: null }] } },
    });
    if (!entry) throw new NotFoundException('Registry entry not found');

    const image = await prisma.image.create({
      data: {
        orgId,
        name: entry.name,
        friendlyName: entry.friendlyName,
        dockerImage: entry.dockerImage,
        channel: 'CUSTOM',
        sourceRegistryEntryId: entry.id,
      },
    });

    let workspaceId: string | undefined;
    if (dto.createWorkspace) {
      const workspace = await prisma.workspace.create({
        data: {
          orgId,
          name: entry.name,
          friendlyName: entry.friendlyName,
          description: entry.description,
          imageId: image.id,
          categories: entry.categories,
          iconUrl: entry.iconUrl,
        },
      });
      workspaceId = workspace.id;
    }

    await prisma.registryEntry.update({ where: { id: entry.id }, data: { installed: true } });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'registry.install',
      targetType: 'RegistryEntry',
      targetId: entry.id,
      metadata: { imageId: image.id, workspaceId },
    });
    return { ok: true, imageId: image.id, workspaceId };
  }
}

interface RegistryIndexItem {
  name?: string;
  friendlyName?: string;
  description?: string;
  dockerImage?: string;
  iconUrl?: string;
  categories?: string[];
}

/** Accept either a bare array or a `{ items: [...] }` / `{ workspaces: [...] }` wrapper. */
function normalizeIndex(body: unknown): RegistryIndexItem[] {
  if (Array.isArray(body)) return body as RegistryIndexItem[];
  const obj = body as { items?: unknown; workspaces?: unknown };
  if (Array.isArray(obj?.items)) return obj.items as RegistryIndexItem[];
  if (Array.isArray(obj?.workspaces)) return obj.workspaces as RegistryIndexItem[];
  return [];
}
