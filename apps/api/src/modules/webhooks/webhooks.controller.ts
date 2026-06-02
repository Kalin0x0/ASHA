import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateWebhookDto,
  createWebhookSchema,
  type UpdateWebhookDto,
  updateWebhookSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @RequirePermissions('WEBHOOK_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.webhooks.list(user.orgId);
  }

  @RequirePermissions('WEBHOOK_MANAGE')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWebhookSchema)) dto: CreateWebhookDto,
  ) {
    return this.webhooks.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('WEBHOOK_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateWebhookSchema)) dto: UpdateWebhookDto,
  ) {
    return this.webhooks.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('WEBHOOK_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooks.remove(user.orgId, user.sub, id);
  }

  @RequirePermissions('WEBHOOK_MANAGE')
  @Get(':id/deliveries')
  listDeliveries(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooks.listDeliveries(user.orgId, id);
  }

  @RequirePermissions('WEBHOOK_MANAGE')
  @Post(':id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooks.test(user.orgId, id);
  }
}
