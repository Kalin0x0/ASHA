import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type SessionObservationDto,
  sessionObservationSchema,
  type StartObservationDto,
  startObservationSchema,
} from '@asha/contracts';
import { AgentOnly, type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import type { AgentTokenScope } from '../../common/jwt-auth.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { ObservationService } from './observation.service';

@ApiTags('sessions')
@Controller()
export class ObservationController {
  constructor(private readonly observation: ObservationService) {}

  // A literal segment under `sessions/`, so it must be registered before
  // `GET sessions/:id` claims it — see the module ordering note in app.module.ts
  // and the same hazard documented for `sessions/mine`.
  @ApiBearerAuth()
  @RequirePermissions('SESSION_OBSERVE')
  @Get('sessions/observations')
  list(@CurrentUser() user: AuthUser) {
    return this.observation.list(user);
  }

  // The guard answers "may this caller observe at all"; the service adds the
  // row-level "may they observe THIS session" the guard has no context for.
  @ApiBearerAuth()
  @RequirePermissions('SESSION_OBSERVE')
  @Post('sessions/:id/observe')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(startObservationSchema)) dto: StartObservationDto,
  ) {
    return this.observation.start(user, id, dto);
  }

  @ApiBearerAuth()
  @RequirePermissions('SESSION_OBSERVE')
  @Delete('sessions/:id/observe')
  stop(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.observation.stop(user, id);
  }

  // ── Internal: agent → manager (shared-token / mTLS network) ────────────────
  // `kasmId` is attacker-controlled, so the token's scope is forwarded and
  // checked against the session's org before anything is stored.
  @AgentOnly()
  @Post('internal/agents/:agentId/sessions/:kasmId/observation')
  ingest(
    @Req() req: { agentToken?: AgentTokenScope },
    @Param('kasmId') kasmId: string,
    @Body(new ZodPipe(sessionObservationSchema)) dto: SessionObservationDto,
  ) {
    return this.observation.ingest(kasmId, dto, req.agentToken);
  }
}
