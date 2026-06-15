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
      )
      .then((entries) =>
        // Surface an estimated size when the registry index carried one (raw.size_mb).
        entries.map((e) => {
          const size = (e.raw as { size_mb?: unknown } | null)?.size_mb;
          return { ...e, sizeMb: typeof size === 'number' ? size : undefined };
        }),
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

  // ── Images: digest-pinning + pull-policy (A3) ─────────────────────────────

  listImages(orgId: string) {
    return prisma.image.findMany({
      where: { OR: [{ orgId }, { orgId: null }] },
      orderBy: { friendlyName: 'asc' },
    });
  }

  /** Resolve a repo:tag reference to its content digest via the Docker Registry v2 API. */
  async resolveDigest(dockerImage: string): Promise<string> {
    const ref = parseImageRef(dockerImage);
    const url = `https://${ref.registry}/v2/${ref.repository}/manifests/${ref.tag}`;
    const accept = [
      'application/vnd.docker.distribution.manifest.v2+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.oci.image.index.v1+json',
    ].join(', ');
    const head = (token?: string) =>
      fetch(url, { method: 'HEAD', headers: { Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    let res = await head();
    if (res.status === 401) {
      const token = await fetchRegistryToken(res.headers.get('www-authenticate'), ref.repository);
      if (token) res = await head(token);
    }
    if (!res.ok) throw new BadRequestException(`Digest resolve failed for "${dockerImage}": ${res.status}`);
    const digest = res.headers.get('docker-content-digest');
    if (!digest) throw new BadRequestException(`No content digest returned for "${dockerImage}"`);
    return digest;
  }

  /** Pin an org image to its current tag's digest (reproducible launches). */
  async promoteImage(orgId: string, actorUserId: string, imageId: string) {
    const image = await prisma.image.findFirst({ where: { id: imageId, orgId } });
    if (!image) throw new NotFoundException('Image not found');
    const digest = await this.resolveDigest(image.dockerImage);
    const updated = await prisma.image.update({ where: { id: image.id }, data: { digest } });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'image.promote',
      targetType: 'Image',
      targetId: image.id,
      metadata: { dockerImage: image.dockerImage, digest },
    });
    return { id: updated.id, dockerImage: updated.dockerImage, digest: updated.digest };
  }

  async setPullPolicy(
    orgId: string,
    actorUserId: string,
    imageId: string,
    pullPolicy: 'ALWAYS' | 'IF_NOT_PRESENT' | 'NEVER',
  ) {
    const res = await prisma.image.updateMany({ where: { id: imageId, orgId }, data: { pullPolicy } });
    if (res.count === 0) throw new NotFoundException('Image not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'image.pull_policy',
      targetType: 'Image',
      targetId: imageId,
      metadata: { pullPolicy },
    });
    return prisma.image.findUnique({ where: { id: imageId } });
  }
}

/** Parse a Docker image reference into registry host, repository, and tag. */
function parseImageRef(image: string): { registry: string; repository: string; tag: string } {
  let rest = image.trim();
  let registry = 'registry-1.docker.io';
  const slash = rest.indexOf('/');
  const firstSeg = slash >= 0 ? rest.slice(0, slash) : '';
  // A leading segment with a dot/colon (or "localhost") is a registry host.
  if (firstSeg && (firstSeg.includes('.') || firstSeg.includes(':') || firstSeg === 'localhost')) {
    registry = firstSeg;
    rest = rest.slice(slash + 1);
  }
  let tag = 'latest';
  const at = rest.indexOf('@');
  if (at >= 0) {
    tag = rest.slice(at + 1); // digest reference
    rest = rest.slice(0, at);
  } else {
    const colon = rest.lastIndexOf(':');
    if (colon >= 0 && !rest.slice(colon).includes('/')) {
      tag = rest.slice(colon + 1);
      rest = rest.slice(0, colon);
    }
  }
  let repository = rest;
  // Docker Hub official ("library") images are addressed bare (e.g. `nginx`).
  if (registry === 'registry-1.docker.io' && !repository.includes('/')) repository = `library/${repository}`;
  return { registry, repository, tag };
}

/** Exchange a registry's Bearer challenge for a pull-scoped token (Docker Hub etc.). */
async function fetchRegistryToken(wwwAuthenticate: string | null, repository: string): Promise<string | null> {
  if (!wwwAuthenticate || !wwwAuthenticate.toLowerCase().startsWith('bearer ')) return null;
  const params: Record<string, string> = {};
  for (const m of wwwAuthenticate.slice(7).matchAll(/(\w+)="([^"]*)"/g)) params[m[1]!] = m[2]!;
  if (!params.realm) return null;
  const url = new URL(params.realm);
  if (params.service) url.searchParams.set('service', params.service);
  url.searchParams.set('scope', params.scope ?? `repository:${repository}:pull`);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const body = (await res.json()) as { token?: string; access_token?: string };
  return body.token ?? body.access_token ?? null;
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
export function normalizeIndex(body: unknown): RegistryIndexItem[] {
  if (Array.isArray(body)) return body as RegistryIndexItem[];
  const obj = body as { items?: unknown; workspaces?: unknown; data?: { repositories?: unknown } };
  if (Array.isArray(obj?.items)) return obj.items as RegistryIndexItem[];
  if (Array.isArray(obj?.workspaces)) return obj.workspaces as RegistryIndexItem[];
  // LinuxServer.io fleet API: { data: { repositories: { <repo>: [ { name, description, category, project_logo } ] } } }
  const repos = obj?.data?.repositories;
  if (repos && typeof repos === 'object') return parseLinuxServer(repos as Record<string, unknown>);
  return [];
}

/** Map the LinuxServer.io fleet API into installable registry items. */
function parseLinuxServer(repos: Record<string, unknown>): RegistryIndexItem[] {
  const items: RegistryIndexItem[] = [];
  for (const [repo, arr] of Object.entries(repos)) {
    if (!Array.isArray(arr)) continue;
    for (const im of arr as Array<Record<string, unknown>>) {
      const name = typeof im.name === 'string' ? im.name : '';
      if (!name || im.deprecated) continue;
      const category = typeof im.category === 'string' ? im.category : '';
      items.push({
        name,
        friendlyName: titleCase(name),
        description: typeof im.description === 'string' ? im.description : undefined,
        // LinuxServer images are pulled from the lscr.io mirror.
        dockerImage: `lscr.io/${repo}/${name}:latest`,
        iconUrl: typeof im.project_logo === 'string' ? im.project_logo : undefined,
        categories: category ? category.split(/[,;|/]/).map((s) => s.trim()).filter(Boolean) : [],
      });
    }
  }
  return items;
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
