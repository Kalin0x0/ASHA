import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateFeedbackDto,
  createFeedbackSchema,
  type UpdateFeedbackDto,
  updateFeedbackSchema,
} from '@asha/contracts';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { FeedbackService } from './feedback.service';

@ApiTags('feedback')
@ApiBearerAuth()
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  // Any signed-in user can file a bug/feedback (no special permission).
  @Audit('feedback.create', { targetType: 'Feedback' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createFeedbackSchema)) dto: CreateFeedbackDto) {
    return this.feedback.create(user, dto);
  }

  // Triage surface (the shared "memory") — admins only.
  @RequirePermissions('SETTINGS_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.feedback.list(user.orgId, status);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateFeedbackSchema)) dto: UpdateFeedbackDto,
  ) {
    return this.feedback.update(user.orgId, user.sub, id, dto);
  }
}
