import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PolicyService } from './policy.service';

const policySchema = z
  .object({
    maxSystemAdmins: z.number().int().min(0).optional(),
    groupIdleTimeoutRequired: z.boolean().optional(),
    workspaceDlpRequired: z.object({ field: z.string().min(1).max(60), value: z.unknown() }).optional(),
  })
  .passthrough();
type PolicyDto = z.infer<typeof policySchema>;

@ApiTags('policy')
@ApiBearerAuth()
@Controller('policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  /** Evaluate the org's current state against a declarative policy (drift report). */
  @RequirePermissions('SETTINGS_MANAGE')
  @Post('evaluate')
  evaluate(@CurrentUser() user: AuthUser, @Body(new ZodPipe(policySchema)) dto: PolicyDto) {
    return this.policy.evaluate(user.orgId, dto);
  }
}
