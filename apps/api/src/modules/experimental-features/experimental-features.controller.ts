import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ExperimentalFeaturesService } from './experimental-features.service';
import { FeatureGuard } from './feature.guard';

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  stage: z.enum(['preview', 'develop']).optional(),
  sinceVersion: z.string().max(40).optional(),
  enabledByDefault: z.boolean().optional(),
});
type RegisterDto = z.infer<typeof registerSchema>;

const flagSchema = z.object({ enabled: z.boolean(), acceptedRisk: z.boolean().optional() });
type FlagDto = z.infer<typeof flagSchema>;

@ApiTags('experimental-features')
@ApiBearerAuth()
@Controller('features')
export class ExperimentalFeaturesController {
  constructor(private readonly features: ExperimentalFeaturesService) {}

  @RequirePermissions('SETTINGS_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.features.list(user.orgId);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Post('catalog')
  register(@Body(new ZodPipe(registerSchema)) dto: RegisterDto) {
    return this.features.registerFeature(dto);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Post(':name/flag')
  setFlag(@CurrentUser() user: AuthUser, @Param('name') name: string, @Body(new ZodPipe(flagSchema)) dto: FlagDto) {
    return this.features.setFlag(user.orgId, user.sub, name, dto.enabled, dto.acceptedRisk ?? false);
  }

  /** Demo route gated by a feature flag — proves @RequireFeature + FeatureGuard. */
  @UseGuards(FeatureGuard)
  @RequireFeature('realtime-collaboration')
  @Get('demo/realtime')
  demo() {
    return { ok: true, feature: 'realtime-collaboration' };
  }
}
