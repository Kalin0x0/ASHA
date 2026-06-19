import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateFileMappingDto,
  createFileMappingSchema,
  type CreatePersistentProfileDto,
  createPersistentProfileSchema,
  type CreateStorageMappingDto,
  createStorageMappingSchema,
  type CreateVolumeMappingDto,
  createVolumeMappingSchema,
  type UpdateFileMappingDto,
  updateFileMappingSchema,
  type UpdateStorageMappingDto,
  updateStorageMappingSchema,
  type UpdateVolumeMappingDto,
  updateVolumeMappingSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { StorageService } from './storage.service';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  // ── Volume mappings ─────────────────────────────────────────────────────────

  @RequirePermissions('STORAGE_MANAGE')
  @Get('volumes')
  listVolumes(@CurrentUser() user: AuthUser) {
    return this.storage.listVolumes(user.orgId);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Post('volumes')
  createVolume(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createVolumeMappingSchema)) dto: CreateVolumeMappingDto,
  ) {
    return this.storage.createVolume(user.orgId, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Patch('volumes/:id')
  updateVolume(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateVolumeMappingSchema)) dto: UpdateVolumeMappingDto,
  ) {
    return this.storage.updateVolume(user.orgId, id, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Delete('volumes/:id')
  removeVolume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storage.removeVolume(user.orgId, id);
  }

  // ── File mappings ───────────────────────────────────────────────────────────

  @RequirePermissions('STORAGE_MANAGE')
  @Get('files')
  listFiles(@CurrentUser() user: AuthUser) {
    return this.storage.listFiles(user.orgId);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Post('files')
  createFile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createFileMappingSchema)) dto: CreateFileMappingDto,
  ) {
    return this.storage.createFile(user.orgId, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Patch('files/:id')
  updateFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateFileMappingSchema)) dto: UpdateFileMappingDto,
  ) {
    return this.storage.updateFile(user.orgId, id, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Delete('files/:id')
  removeFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storage.removeFile(user.orgId, id);
  }

  // ── Persistent profiles ─────────────────────────────────────────────────────

  @RequirePermissions('STORAGE_MANAGE')
  @Get('profiles')
  listProfiles(@CurrentUser() user: AuthUser) {
    return this.storage.listProfiles(user.orgId);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Post('profiles')
  createProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createPersistentProfileSchema)) dto: CreatePersistentProfileDto,
  ) {
    return this.storage.createProfile(user.orgId, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Delete('profiles/:id')
  removeProfile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storage.removeProfile(user.orgId, id);
  }

  // ── Storage mappings ────────────────────────────────────────────────────────

  @RequirePermissions('STORAGE_MANAGE')
  @Get('mappings')
  listStorageMappings(@CurrentUser() user: AuthUser) {
    return this.storage.listStorageMappings(user.orgId);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Post('mappings')
  createStorageMapping(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createStorageMappingSchema)) dto: CreateStorageMappingDto,
  ) {
    return this.storage.createStorageMapping(user.orgId, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Patch('mappings/:id')
  updateStorageMapping(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateStorageMappingSchema)) dto: UpdateStorageMappingDto,
  ) {
    return this.storage.updateStorageMapping(user.orgId, id, dto);
  }

  @RequirePermissions('STORAGE_MANAGE')
  @Delete('mappings/:id')
  removeStorageMapping(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.storage.removeStorageMapping(user.orgId, id);
  }
}
