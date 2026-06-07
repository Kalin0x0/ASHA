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

    const m = this.meta(entry);
    const imageData = {
      orgId,
      name: entry.name,
      friendlyName: dto.friendlyName ?? entry.friendlyName,
      dockerImage: dto.imageOverride ?? entry.dockerImage,
      channel: 'CUSTOM' as const,
      // Carry the registry's declared compatibility + default run config onto the image.
      protocol: m.protocol,
      architecture: m.architecture,
      runConfigDefaults: m.runConfigDefaults,
      sourceRegistryEntryId: entry.id,
    };
    // Idempotent: reuse the image previously materialised from this entry instead of
    // accumulating orphans / colliding on a re-install.
    const existingImage = await prisma.image.findFirst({ where: { orgId, sourceRegistryEntryId: entry.id } });
    const image = existingImage
      ? await prisma.image.update({ where: { id: existingImage.id }, data: imageData })
      : await prisma.image.create({ data: imageData });

    let workspaceId: string | undefined;
    if (dto.createWorkspace) {
      // Reuse a same-named workspace instead of hitting @@unique([orgId,name]) → 500.
      const existingWs = await prisma.workspace.findFirst({ where: { name: entry.name } });
      const workspace =
        existingWs ??
        (await prisma.workspace.create({
          data: {
            orgId,
            name: entry.name,
            friendlyName: dto.friendlyName ?? entry.friendlyName,
            description: entry.description,
            imageId: image.id,
            categories: dto.categories ?? entry.categories,
            iconUrl: entry.iconUrl,
          },
        }));
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

  /** Parse rich install metadata (compat / security / resources / channels) from an entry's raw index item. */
  private meta(entry: { dockerImage: string; raw: unknown }) {
    const raw = (entry.raw ?? {}) as Record<string, any>;
    const rc = (raw.run_config ?? raw.docker_run_config ?? raw.runConfig ?? {}) as Record<string, any>;
    const protocol = normalizeProtocol(raw.protocol ?? rc.protocol);
    const architecture = String(raw.architecture ?? raw.arch ?? 'amd64');
    const num = (v: unknown) =>
      typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;
    const memBytes = num(raw.memory);
    return {
      protocol,
      architecture,
      runConfigDefaults: rc as object,
      compatibility: {
        protocol,
        architectures: Array.isArray(raw.architectures) ? raw.architectures : [architecture],
        gpuRequired: Boolean(raw.gpu ?? raw.require_gpu ?? rc.gpus),
      },
      security: {
        runAsRoot: rc.user === 'root' || rc.user === '0' || Boolean(raw.run_as_root),
        privileged: Boolean(rc.privileged),
        capAdd: Array.isArray(rc.cap_add) ? rc.cap_add : [],
      },
      resources: {
        cores: num(raw.cores ?? raw.cpu_cores ?? rc.cores),
        memoryMb: memBytes ? Math.round(memBytes / 1_048_576) : num(raw.memory_mb),
      },
      channels: Array.isArray(raw.channels)
        ? raw.channels
        : Array.isArray(raw.tags)
          ? raw.tags
          : entry.dockerImage.includes(':')
            ? [entry.dockerImage.split(':').pop()]
            : ['latest'],
      estimatedSizeMb: num(raw.size_mb ?? raw.estimated_size_mb ?? raw.uncompressed_size_mb),
    };
  }

  /** Install preview — surfaces compatibility, security flags, resources, channels & size for edit-before-install. */
  async preview(orgId: string, entryId: string) {
    const entry = await prisma.registryEntry.findFirst({
      where: { id: entryId, registry: { OR: [{ orgId }, { orgId: null }] } },
    });
    if (!entry) throw new NotFoundException('Registry entry not found');
    const m = this.meta(entry);
    return {
      id: entry.id,
      name: entry.name,
      friendlyName: entry.friendlyName,
      description: entry.description,
      dockerImage: entry.dockerImage,
      iconUrl: entry.iconUrl,
      categories: entry.categories,
      installed: entry.installed,
      compatibility: m.compatibility,
      security: m.security,
      resources: m.resources,
      channels: m.channels,
      estimatedSizeMb: m.estimatedSizeMb,
    };
  }
}

function normalizeProtocol(p: unknown): 'KASMVNC' | 'RDP' | 'VNC' | 'SSH' | 'WEBRTC' {
  const s = String(p ?? '').toUpperCase();
  return (['KASMVNC', 'RDP', 'VNC', 'SSH', 'WEBRTC'] as readonly string[]).includes(s)
    ? (s as 'KASMVNC')
    : 'KASMVNC';
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
