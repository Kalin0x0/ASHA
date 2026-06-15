import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type RegisterServerAgentDto,
  registerServerAgentSchema,
  type ServerAgentHeartbeatDto,
  serverAgentHeartbeatSchema,
} from '@chista/contracts';
import { Public } from '../../common/decorators';
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
}
