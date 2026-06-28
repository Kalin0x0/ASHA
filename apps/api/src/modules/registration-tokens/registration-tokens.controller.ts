import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { RegistrationTokensService } from './registration-tokens.service';

const mintSchema = z.object({
  name: z.string().min(1).max(120),
  zoneId: z.string().optional(),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});
type MintDto = z.infer<typeof mintSchema>;

@ApiTags('registration-tokens')
@ApiBearerAuth()
@Controller('registration-tokens')
export class RegistrationTokensController {
  constructor(private readonly svc: RegistrationTokensService) {}

  @Audit('agent.token.mint', { targetType: 'RegistrationToken' })
  @RequirePermissions('AGENT_MANAGE')
  @Post()
  mint(@CurrentUser() user: AuthUser, @Body(new ZodPipe(mintSchema)) dto: MintDto) {
    return this.svc.mint(user, dto);
  }

  @RequirePermissions('AGENT_VIEW')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Audit('agent.token.revoke', { targetType: 'RegistrationToken' })
  @RequirePermissions('AGENT_MANAGE')
  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.revoke(user, id);
  }
}
