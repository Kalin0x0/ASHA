import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ImageBuildsService } from './image-builds.service';

const createSchema = z.object({
  sessionId: z.string().min(1),
  tag: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9][a-z0-9._/-]*(:[a-zA-Z0-9._-]+)?$/, 'Invalid image tag'),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags('image-builds')
@ApiBearerAuth()
@Controller('image-builds')
export class ImageBuildsController {
  constructor(private readonly builds: ImageBuildsService) {}

  /** Commit-to-Image: snapshot a session container into a new image tag (A4). */
  @RequirePermissions('IMAGE_MANAGE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    return this.builds.create(user.orgId, user.sub, dto.sessionId, dto.tag);
  }

  @RequirePermissions('IMAGE_MANAGE')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.builds.get(user.orgId, id);
  }

  @RequirePermissions('IMAGE_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('sessionId') sessionId?: string) {
    return this.builds.list(user.orgId, sessionId);
  }
}
