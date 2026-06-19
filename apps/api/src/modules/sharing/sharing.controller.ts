import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateShareDto,
  createShareSchema,
  type JoinShareDto,
  joinShareSchema,
  type PostChatMessageDto,
  postChatMessageSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { SharingService } from './sharing.service';

/**
 * Owner-facing endpoints live under /sessions/:sessionId/share and require the
 * SESSION_SHARE permission. Guest-facing endpoints live under /share/:shareKey
 * and are public — the share key itself is the bearer credential.
 */
@ApiTags('sharing')
@Controller()
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  // ── Owner endpoints ───────────────────────────────────────────────────────

  @ApiBearerAuth()
  @RequirePermissions('SESSION_SHARE')
  @Post('sessions/:sessionId/share')
  create(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body(new ZodPipe(createShareSchema)) dto: CreateShareDto,
  ) {
    return this.sharing.create(user, sessionId, dto);
  }

  @ApiBearerAuth()
  @RequirePermissions('SESSION_SHARE')
  @Get('sessions/:sessionId/share')
  getForSession(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string) {
    return this.sharing.listForSession(user.orgId, sessionId);
  }

  @ApiBearerAuth()
  @RequirePermissions('SESSION_SHARE')
  @Delete('sessions/:sessionId/share')
  revoke(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string) {
    return this.sharing.revoke(user, sessionId);
  }

  // ── Guest endpoints (public; the share key is the credential) ─────────────

  @Public()
  @Post('share/:shareKey/join')
  join(
    @Param('shareKey') shareKey: string,
    @Body(new ZodPipe(joinShareSchema)) dto: JoinShareDto,
    @Req() req: { user?: AuthUser },
  ) {
    return this.sharing.join(shareKey, dto, req.user?.sub);
  }

  @Public()
  @Post('share/:shareKey/leave/:participantId')
  leave(@Param('shareKey') shareKey: string, @Param('participantId') participantId: string) {
    return this.sharing.leave(shareKey, participantId);
  }

  @Public()
  @Get('share/:shareKey/messages')
  listMessages(@Param('shareKey') shareKey: string, @Req() req: { user?: AuthUser }) {
    return this.sharing.listMessages(shareKey, req.user?.sub);
  }

  @Public()
  @Post('share/:shareKey/messages')
  postMessage(
    @Param('shareKey') shareKey: string,
    @Body(new ZodPipe(postChatMessageSchema)) dto: PostChatMessageDto,
    @Req() req: { user?: AuthUser },
  ) {
    const author = req.user ? { id: req.user.sub, name: req.user.email } : undefined;
    return this.sharing.postMessage(shareKey, dto, author);
  }
}
