import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateWorkspaceDto } from '@chista/contracts';
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

  create(orgId: string, dto: CreateWorkspaceDto) {
    return prisma.workspace.create({
      data: {
        orgId,
        name: dto.name,
        friendlyName: dto.friendlyName,
        description: dto.description,
        type: dto.type,
        imageId: dto.imageId,
        categories: dto.categories,
        coresLimit: dto.coresLimit,
        memLimitMb: dto.memLimitMb,
        gpuCount: dto.gpuCount,
        dockerConfig: dto.dockerConfig as object,
      },
    });
  }
}
