import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { TariffsService } from './tariffs.service';

const upsertTariffSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  period: z.enum(['MINUTE', 'HOUR', 'MONTH']),
  budgetMinutes: z.number().int().positive().nullish(),
  maxSessionMinutes: z.number().int().positive().nullish(),
  maxConcurrent: z.number().int().positive().nullish(),
  isDefault: z.boolean().optional(),
});
type UpsertTariffDto = z.infer<typeof upsertTariffSchema>;

const assignTariffSchema = z.object({
  tariffId: z.string().min(1),
  subjectType: z.enum(['ORG', 'GROUP', 'USER']),
  subjectId: z.string().min(1),
});
type AssignTariffDto = z.infer<typeof assignTariffSchema>;

@ApiTags('tariffs')
@ApiBearerAuth()
@Controller('tariffs')
export class TariffsController {
  constructor(private readonly svc: TariffsService) {}

  // The signed-in user's own budget — for the portal chip. Declared before the
  // param routes; only needs an authenticated session (any role).
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.svc.usageForUser(user);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.orgId);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Get('assignments')
  assignments(@CurrentUser() user: AuthUser) {
    return this.svc.listAssignments(user.orgId);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body(new ZodPipe(upsertTariffSchema)) dto: UpsertTariffDto) {
    return this.svc.upsert(user.orgId, user.sub, dto);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Post('assign')
  assign(@CurrentUser() user: AuthUser, @Body(new ZodPipe(assignTariffSchema)) dto: AssignTariffDto) {
    return this.svc.assign(user.orgId, user.sub, dto);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user.orgId, user.sub, id);
  }
}
