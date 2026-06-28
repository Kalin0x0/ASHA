import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ApiKeysService } from './api-keys.service';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(64)).max(32).default([]),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @RequirePermissions('APIKEY_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeys.list(user.orgId);
  }

  @RequirePermissions('APIKEY_MANAGE')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createApiKeySchema)) dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('APIKEY_MANAGE')
  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apiKeys.revoke(user.orgId, user.sub, id);
  }
}
