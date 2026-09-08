import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
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
  //
  // `window` names which of the caller's holds this opens or renews, and comes
  // back in the response so the caller can renew and release the same one. One
  // observer may hold several: the wall's tile and the read-only viewer opened
  // from it are two, and the tile going away must not end the observation the
  // viewer is still carrying out. Omitted, it is the caller's single default
  // hold, which is what a page that only ever opens one wants.
  @ApiBearerAuth()
  @RequirePermissions('SESSION_OBSERVE')
  @Post('sessions/:id/observe')
  start(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(startObservationSchema)) dto: StartObservationDto,
    @Query('window') window?: string,
  ) {
    return this.observation.start(user, id, dto, window);
  }

  @ApiBearerAuth()
  @RequirePermissions('SESSION_OBSERVE')
  @Delete('sessions/:id/observe')
  stop(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('window') window?: string) {
    return this.observation.stop(user, id, window);
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
