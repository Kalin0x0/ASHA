import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from '@chista/contracts';
import { prisma } from '@chista/db';

// Container/Server/Zone are all surfaced so the catalog can show what a
// workspace runs on (Docker image, RDP/VNC/SSH server, deployment zone).
const WORKSPACE_INCLUDE = {
  image: true,
  server: { include: { zone: true } },
  zone: true,
} as const;

@Injectable()
export class WorkspacesService {
  list() {
    return prisma.workspace.findMany({ include: WORKSPACE_INCLUDE, orderBy: { friendlyName: 'asc' } });
  }

  launchable() {
    return prisma.workspace.findMany({ where: { enabled: true }, include: WORKSPACE_INCLUDE });
  }

  async get(id: string) {
    const workspace = await prisma.workspace.findUnique({ where: { id }, include: WORKSPACE_INCLUDE });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async create(orgId: string, dto: CreateWorkspaceDto) {
    // Workspace.name is unique per org — fail clearly instead of a raw P2002,
    // and before we create any backing image (so we never orphan one).
    const clash = await prisma.workspace.findFirst({ where: { orgId, name: dto.name } });
    if (clash) throw new ConflictException('A workspace with this name already exists');

    // Server-backed placement (SERVER/VM/REMOTE_APP → RDP/VNC/SSH machines, incl.
    // Windows desktops). Validate an explicitly-chosen zone; a server's own zone
    // is already valid, so it's inherited without a second lookup.
    const serverId = dto.serverId ?? null;
    let zoneId = dto.zoneId ?? null;
    if (zoneId) {
      const zone = await prisma.deploymentZone.findFirst({ where: { id: zoneId, orgId } });
      if (!zone) throw new BadRequestException('Selected zone was not found');
    }
    if (serverId) {
      const server = await prisma.server.findFirst({ where: { id: serverId, orgId } });
      if (!server) throw new BadRequestException('Selected server was not found');
      if (!zoneId) zoneId = server.zoneId;
    }
    if (dto.type === 'SERVER' && !serverId) {
      throw new BadRequestException('Choose a server for a server-backed workspace');
    }

    // Container placement: an explicit imageId wins; otherwise, if a dockerImage
    // was supplied, create+link one so the workspace is launchable right away.
    let imageId = dto.imageId ?? null;
    if (dto.type === 'CONTAINER' && !imageId && dto.dockerImage) {
      const image = await prisma.image.create({
        data: {
          orgId,
          name: dto.name,
          friendlyName: dto.friendlyName,
          dockerImage: dto.dockerImage,
          protocol: 'KASMVNC',
          available: true,
          runConfigDefaults: { ports: [6901] },
        },
      });
      imageId = image.id;
    }

    return prisma.workspace.create({
      data: {
        orgId,
        name: dto.name,
        friendlyName: dto.friendlyName,
        description: dto.description,
        iconUrl: dto.iconUrl,
        type: dto.type,
        imageId,
        serverId,
        zoneId,
        enabled: dto.enabled ?? true,
        categories: dto.categories,
        coresLimit: dto.coresLimit,
        memLimitMb: dto.memLimitMb,
        gpuCount: dto.gpuCount,
        gpu: (dto.gpu ?? {}) as object,
        dlp: (dto.dlp ?? {}) as object,
        dockerConfig: dto.dockerConfig as object,
      },
      include: WORKSPACE_INCLUDE,
    });
  }

  // updateMany/deleteMany are org-scoped (explicit orgId in the where, plus the
  // tenant extension), so a tenant can never touch another org's workspace.
  async update(orgId: string, id: string, dto: UpdateWorkspaceDto) {
    const res = await prisma.workspace.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        friendlyName: dto.friendlyName,
        description: dto.description,
        type: dto.type,
        imageId: dto.imageId,
        serverId: dto.serverId,
        zoneId: dto.zoneId,
        categories: dto.categories,
        coresLimit: dto.coresLimit,
        memLimitMb: dto.memLimitMb,
        gpuCount: dto.gpuCount,
        gpu: dto.gpu as object | undefined,
        dlp: dto.dlp as object | undefined,
        dockerConfig: dto.dockerConfig as object | undefined,
        enabled: dto.enabled,
      },
    });
    if (res.count === 0) throw new NotFoundException('Workspace not found');
    return this.get(id);
  }

  async remove(orgId: string, id: string) {
    const res = await prisma.workspace.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Workspace not found');
    return { ok: true };
  }
}
