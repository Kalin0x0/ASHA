import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type CreateSessionDto, createSessionSchema } from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @RequirePermissions('SESSION_LAUNCH')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSessionSchema)) dto: CreateSessionDto) {
    return this.sessions.create(user, dto);
  }

  @RequirePermissions('SESSION_VIEW_ANY')
  @Get()
  list(@Query('status') status?: string) {
    return this.sessions.list({ status });
  }

  @RequirePermissions('SESSION_VIEW_ANY')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.sessions.get(id);
  }

  @RequirePermissions('SESSION_TERMINATE_ANY')
  @Delete(':id')
  terminate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sessions.terminate(id, user);
  }

  @Post(':id/keepalive')
  keepalive(@Param('id') id: string) {
    return this.sessions.keepalive(id);
  }

  @Get(':id/connection')
  connection(@Param('id') id: string) {
    return this.sessions.connection(id);
  }
}
