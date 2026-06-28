import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { OrgConfigService } from './config.service';

const importSchema = z
  .object({
    version: z.number().optional(),
    volumeMappings: z.array(z.record(z.unknown())).max(2000).optional(),
    fileMappings: z.array(z.record(z.unknown())).max(2000).optional(),
    groups: z.array(z.record(z.unknown())).max(2000).optional(),
  })
  .passthrough();
type ImportDto = z.infer<typeof importSchema>;

@ApiTags('config')
@ApiBearerAuth()
@Controller('config')
export class OrgConfigController {
  constructor(private readonly config: OrgConfigService) {}

  /** Download the org's portable config as a versioned JSON snapshot. */
  @RequirePermissions('SETTINGS_MANAGE')
  @Get('export')
  exportConfig(@CurrentUser() user: AuthUser) {
    return this.config.export(user.orgId);
  }

  /** Re-create config from a snapshot (idempotent: existing names are skipped). */
  @RequirePermissions('SETTINGS_MANAGE')
  @Post('import')
  importConfig(@CurrentUser() user: AuthUser, @Body(new ZodPipe(importSchema)) dto: ImportDto) {
    return this.config.import(user.orgId, user.sub, dto);
  }
}
