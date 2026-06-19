import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type CreateSessionDto, createSessionSchema } from '@asha/contracts';
import { ApiKeyGuard, RequireScopes } from '../../common/api-key.guard';
import { type AuthUser, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { SessionsService } from '../sessions/sessions.service';

/**
 * Public Developer API — authenticated by an API key (not a user JWT), scoped
 * per key. `@Public()` bypasses the JWT guard; `ApiKeyGuard` then authenticates
 * the key and installs an org-scoped principal so the tenant interceptor +
 * SessionsService behave exactly as for a user request.
 */
@ApiTags('developer-api')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('dev')
export class DevApiController {
  constructor(private readonly sessions: SessionsService) {}

  /** Identify the calling key (org + scopes) — useful for SDK/connectivity checks. */
  @RequireScopes()
  @Get('whoami')
  whoami(@Req() req: { user?: AuthUser; apiKey?: { id: string; scopes: string[] } }) {
    return { orgId: req.user?.orgId, apiKeyId: req.apiKey?.id, scopes: req.apiKey?.scopes ?? [] };
  }

  @RequireScopes('sessions:read')
  @Get('sessions')
  listSessions() {
    return this.sessions.list({});
  }

  @RequireScopes('sessions:read')
  @Get('sessions/:id')
  getSession(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.sessions.get(id, req.user);
  }

  /** request_session — programmatically launch a workspace. */
  @RequireScopes('sessions:write')
  @Post('sessions')
  requestSession(@Req() req: { user: AuthUser }, @Body(new ZodPipe(createSessionSchema)) dto: CreateSessionDto) {
    return this.sessions.create(req.user, dto);
  }

  @RequireScopes('sessions:write')
  @Delete('sessions/:id')
  terminateSession(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.sessions.terminate(id, req.user);
  }
}
