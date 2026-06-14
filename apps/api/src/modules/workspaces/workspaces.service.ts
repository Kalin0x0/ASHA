import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from '@chista/contracts';
import { prisma } from '@chista/db';

@Injectable()
export class WorkspacesService {
  list() {
    return prisma.workspace.findMany({ include: { image: true }, orderBy: { friendlyName: 'asc' } });
  }

  launchable() {
    return prisma.workspace.findMany({ where: { enabled: true }, include: { image: true } });
  }

  async get(id: string) {
    const workspace = await prisma.workspace.findUnique({ where: { id }, include: { image: true } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async create(orgId: string, dto: CreateWorkspaceDto) {
    // Workspace.name is unique per org — fail clearly instead of a raw P2002,
    // and before we create any backing image (so we never orphan one).
    const clash = await prisma.workspace.findFirst({ where: { orgId, name: dto.name } });
    if (clash) throw new ConflictException('A workspace with this name already exists');

    // Bind an image: an explicit imageId wins; otherwise, if a dockerImage was
    // supplied, create+link one so the new workspace is launchable right away.
    let imageId = dto.imageId;
    if (!imageId && dto.dockerImage) {
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
        type: dto.type,
        imageId,
        enabled: dto.enabled ?? true,
        categories: dto.categories,
        coresLimit: dto.coresLimit,
        memLimitMb: dto.memLimitMb,
        gpuCount: dto.gpuCount,
        gpu: (dto.gpu ?? {}) as object,
        dlp: (dto.dlp ?? {}) as object,
        dockerConfig: dto.dockerConfig as object,
      },
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
