import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AgentTokenScope } from '../../common/jwt-auth.guard';
import {
  type AgentHeartbeatDto,
  agentHeartbeatSchema,
  type AgentRegisterDto,
  agentRegisterSchema,
  type SessionStatsDto,
  sessionStatsSchema,
  type SessionStatusDto,
  sessionStatusSchema,
} from '@chista/contracts';
import { AgentOnly, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AgentsService } from './agents.service';

@ApiTags('agents')
@Controller()
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  // ── Internal: agent → manager (shared-token / mTLS network) ────────────────
  @AgentOnly()
  @Post('internal/agents/register')
  register(
    @Req() req: { agentToken?: AgentTokenScope },
    @Body(new ZodPipe(agentRegisterSchema)) dto: AgentRegisterDto,
  ) {
    return this.agents.register(dto, req.agentToken);
  }

  @AgentOnly()
  @Post('internal/agents/:id/heartbeat')
  heartbeat(@Param('id') id: string, @Body(new ZodPipe(agentHeartbeatSchema)) dto: AgentHeartbeatDto) {
    return this.agents.heartbeat(id, dto);
  }

  @AgentOnly()
  @Post('internal/agents/:id/sessions/:sid/status')
  status(@Param('sid') sid: string, @Body(new ZodPipe(sessionStatusSchema)) dto: SessionStatusDto) {
    return this.agents.updateSessionStatus(sid, dto);
  }

  @AgentOnly()
  @Post('internal/agents/:id/stats')
  stats(@Body(new ZodPipe(sessionStatsSchema)) dto: SessionStatsDto) {
    return this.agents.ingestStats(dto);
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  @ApiBearerAuth()
  @RequirePermissions('AGENT_VIEW')
  @Get('agents')
  list() {
    return this.agents.listAgents();
  }

  @ApiBearerAuth()
  @RequirePermissions('AGENT_MANAGE')
  @Patch('agents/:id/drain')
  drain(@Param('id') id: string) {
    return this.agents.setAgentState(id, 'DRAINING');
  }

  @ApiBearerAuth()
  @RequirePermissions('AGENT_MANAGE')
  @Delete('agents/:id')
  remove(@Param('id') id: string) {
    return this.agents.remove(id);
  }
}
