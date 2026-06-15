import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { CopilotService } from './copilot.service';

const askSchema = z.object({ query: z.string().min(1).max(500) });
type AskDto = z.infer<typeof askSchema>;

@ApiTags('copilot')
@ApiBearerAuth()
@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  /** Ask the copilot a natural-language question about the org's platform state. */
  @RequirePermissions('REPORTING_VIEW')
  @Post('ask')
  ask(@CurrentUser() user: AuthUser, @Body(new ZodPipe(askSchema)) dto: AskDto) {
    return this.copilot.ask(user.orgId, dto.query);
  }
}
