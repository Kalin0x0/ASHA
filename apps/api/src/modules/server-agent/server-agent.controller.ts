import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type RegisterServerAgentDto,
  registerServerAgentSchema,
  type ServerAgentHeartbeatDto,
  serverAgentHeartbeatSchema,
  type ServerAgentTunnelDto,
  serverAgentTunnelSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ServerAgentService } from './server-agent.service';

/**
 * Endpoints for the installable host/Windows agent. Authenticated with a
 * registration token (header `x-registration-token`), not a user session.
 */
@ApiTags('server-agent')
@Controller('agent/server')
export class ServerAgentController {
  constructor(private readonly svc: ServerAgentService) {}

  @Public()
  @Post('register')
  register(
    @Headers('x-registration-token') token: string,
    @Body(new ZodPipe(registerServerAgentSchema)) dto: RegisterServerAgentDto,
  ) {
    return this.svc.register(token ?? '', dto);
  }

  @Public()
  @Post('heartbeat')
  heartbeat(
    @Headers('x-registration-token') token: string,
    @Body(new ZodPipe(serverAgentHeartbeatSchema)) dto: ServerAgentHeartbeatDto,
  ) {
    return this.svc.heartbeat(token ?? '', dto);
  }

  /** Issue a WireGuard tunnel config for a registered host (reachability). */
  @Public()
  @Post('tunnel')
  tunnel(
    @Headers('x-registration-token') token: string,
    @Body(new ZodPipe(serverAgentTunnelSchema)) dto: ServerAgentTunnelDto,
  ) {
    return this.svc.requestTunnel(token ?? '', dto.hostname);
  }

  /** WireGuard server-side peer list for all tunnelled hosts (admin/ops). */
  @ApiBearerAuth()
  @RequirePermissions('SERVER_MANAGE')
  @Get('wg-peers')
  wgPeers(@CurrentUser() user: AuthUser) {
    return this.svc.wgPeers(user.orgId);
  }
}
