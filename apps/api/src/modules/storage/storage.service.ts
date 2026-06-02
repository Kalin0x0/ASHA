import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateFileMappingDto,
  CreatePersistentProfileDto,
  CreateStorageMappingDto,
  CreateVolumeMappingDto,
  UpdateFileMappingDto,
  UpdateStorageMappingDto,
  UpdateVolumeMappingDto,
} from '@chista/contracts';
import { prisma } from '@chista/db';

/**
 * Storage management: volume mappings, file mappings, and persistent profiles.
 *
 * Every mutation is org-scoped through `updateMany`/`deleteMany` with an explicit
 * `orgId` in the where clause (plus the tenant extension) so a tenant can never
 * read or touch another org's storage objects.
 */
@Injectable()
export class StorageService {
  // ── Volume mappings ─────────────────────────────────────────────────────────

  listVolumes(orgId: string) {
    return prisma.volumeMapping.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  createVolume(orgId: string, dto: CreateVolumeMappingDto) {
    return prisma.volumeMapping.create({
      data: {
        orgId,
        name: dto.name,
        hostPath: dto.hostPath,
        destPath: dto.destPath,
        readOnly: dto.readOnly,
        raw: dto.raw as object,
      },
    });
  }

  async updateVolume(orgId: string, id: string, dto: UpdateVolumeMappingDto) {
    const res = await prisma.volumeMapping.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        hostPath: dto.hostPath,
        destPath: dto.destPath,
        readOnly: dto.readOnly,
        raw: dto.raw as object | undefined,
      },
    });
    if (res.count === 0) throw new NotFoundException('Volume mapping not found');
    return prisma.volumeMapping.findUnique({ where: { id } });
  }

  async removeVolume(orgId: string, id: string) {
    const res = await prisma.volumeMapping.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Volume mapping not found');
    return { ok: true };
  }

  // ── File mappings ───────────────────────────────────────────────────────────

  listFiles(orgId: string) {
    return prisma.fileMapping.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  createFile(orgId: string, dto: CreateFileMappingDto) {
    return prisma.fileMapping.create({
      data: {
        orgId,
        name: dto.name,
        target: dto.target,
        sourcePath: dto.sourcePath,
        destPath: dto.destPath,
        owner: dto.owner,
        group: dto.group,
        mode: dto.mode,
        isHomeProfile: dto.isHomeProfile,
        scope: dto.scope,
        userId: dto.userId,
      },
    });
  }

  async updateFile(orgId: string, id: string, dto: UpdateFileMappingDto) {
    const res = await prisma.fileMapping.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        target: dto.target,
        sourcePath: dto.sourcePath,
        destPath: dto.destPath,
        owner: dto.owner,
        group: dto.group,
        mode: dto.mode,
        isHomeProfile: dto.isHomeProfile,
        scope: dto.scope,
        userId: dto.userId,
      },
    });
    if (res.count === 0) throw new NotFoundException('File mapping not found');
    return prisma.fileMapping.findUnique({ where: { id } });
  }

  async removeFile(orgId: string, id: string) {
    const res = await prisma.fileMapping.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('File mapping not found');
    return { ok: true };
  }

  // ── Persistent profiles ─────────────────────────────────────────────────────

  listProfiles(orgId: string) {
    return prisma.persistentProfile.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  }

  createProfile(orgId: string, dto: CreatePersistentProfileDto) {
    return prisma.persistentProfile.create({
      data: {
        orgId,
        userId: dto.userId,
        workspaceId: dto.workspaceId,
        volumeName: dto.volumeName,
        backend: dto.backend,
        sizeLimitMb: dto.sizeLimitMb,
      },
    });
  }

  async removeProfile(orgId: string, id: string) {
    const res = await prisma.persistentProfile.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Persistent profile not found');
    return { ok: true };
  }

  // ── Storage mappings (network/object storage mounts) ─────────────────────────

  listStorageMappings(orgId: string) {
    return prisma.storageMapping.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  }

  createStorageMapping(orgId: string, dto: CreateStorageMappingDto) {
    return prisma.storageMapping.create({
      data: {
        orgId,
        name: dto.name,
        kind: dto.kind,
        mountPath: dto.mountPath,
        readOnly: dto.readOnly,
        scope: dto.scope,
        config: dto.config as object,
        enabled: dto.enabled,
      },
    });
  }

  async updateStorageMapping(orgId: string, id: string, dto: UpdateStorageMappingDto) {
    const res = await prisma.storageMapping.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        mountPath: dto.mountPath,
        readOnly: dto.readOnly,
        scope: dto.scope,
        config: dto.config as object | undefined,
        enabled: dto.enabled,
      },
    });
    if (res.count === 0) throw new NotFoundException('Storage mapping not found');
    return prisma.storageMapping.findFirst({ where: { id, orgId } });
  }

  async removeStorageMapping(orgId: string, id: string) {
    const res = await prisma.storageMapping.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Storage mapping not found');
    return { ok: true };
  }
}
