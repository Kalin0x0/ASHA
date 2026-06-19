import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { CreateShareDto, JoinShareDto, PostChatMessageDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import type { ShareChatEvent, ShareParticipantEvent } from '@asha/events';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { SessionsGateway } from '../sessions/sessions.gateway';

/**
 * Session sharing: an owner opens a running session to collaborators via a
 * time-limited share key. Guests join, exchange chat messages over the existing
 * WebSocket gateway, and optionally take control.
 */
@Injectable()
export class SharingService {
  constructor(
    private readonly gateway: SessionsGateway,
    private readonly audit: AuditService,
  ) {}

  /** Owner creates (or replaces) a share for one of their sessions. */
  async create(user: AuthUser, sessionId: string, dto: CreateShareDto) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    // Org check first so a foreign session is indistinguishable from a missing
    // one (no cross-tenant existence leak), then the owner check.
    if (!session || session.orgId !== user.orgId) throw new NotFoundException('Session not found');
    if (session.userId !== user.sub) {
      throw new BadRequestException('Only the session owner can share it');
    }
    if (session.status !== 'RUNNING' && session.status !== 'DEGRADED') {
      throw new BadRequestException('Session must be running to share');
    }

    const expiresAt = dto.expiresInMinutes
      ? new Date(Date.now() + dto.expiresInMinutes * 60_000)
      : null;

    // One share per session (sessionId is unique) — upsert keeps it idempotent.
    const share = await prisma.sessionShare.upsert({
      where: { sessionId },
      create: {
        orgId: user.orgId,
        sessionId,
        allowControl: dto.allowControl,
        requireAuth: dto.requireAuth,
        enableChat: dto.enableChat,
        enableAv: dto.enableAv,
        expiresAt,
      },
      update: {
        allowControl: dto.allowControl,
        requireAuth: dto.requireAuth,
        enableChat: dto.enableChat,
        enableAv: dto.enableAv,
        expiresAt,
      },
    });

    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.sub,
      action: 'session.share',
      targetType: 'Session',
      targetId: sessionId,
    });

    return share;
  }

  async listForSession(orgId: string, sessionId: string) {
    // Scope by orgId so an admin in one tenant can't read another tenant's
    // share config / chat by guessing a session id.
    return prisma.sessionShare.findFirst({
      where: { sessionId, orgId },
      include: { participants: true, messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
  }

  async revoke(user: AuthUser, sessionId: string) {
    const res = await prisma.sessionShare.deleteMany({ where: { sessionId, orgId: user.orgId } });
    if (res.count === 0) throw new NotFoundException('Share not found');
    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.sub,
      action: 'session.unshare',
      targetType: 'Session',
      targetId: sessionId,
    });
    return { ok: true };
  }

  /** Resolve a share by its public key, enforcing expiry. */
  private async resolveActiveShare(shareKey: string) {
    const share = await prisma.sessionShare.findUnique({ where: { shareKey } });
    if (!share) throw new NotFoundException('Share not found');
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new BadRequestException('Share link has expired');
    }
    return share;
  }

  /**
   * Enforce a share's `requireAuth` flag: when set, only a signed-in Asha user
   * (not an anonymous guest holding only the key) may participate. The guest
   * routes are public, so this is the single place that gates authentication.
   */
  private assertAuthAllowed(share: { requireAuth: boolean }, userId?: string) {
    if (share.requireAuth && !userId) {
      throw new UnauthorizedException('This share requires you to sign in');
    }
  }

  /** A guest (or authenticated user) joins a share by key. */
  async join(shareKey: string, dto: JoinShareDto, userId?: string) {
    const share = await this.resolveActiveShare(shareKey);
    this.assertAuthAllowed(share, userId);

    const participant = await prisma.shareParticipant.create({
      data: {
        shareId: share.id,
        userId: userId ?? null,
        guestName: dto.guestName ?? null,
        canControl: share.allowControl,
      },
    });

    const evt: ShareParticipantEvent = {
      shareId: share.id,
      sessionId: share.sessionId,
      participantId: participant.id,
      name: dto.guestName ?? 'Guest',
      joined: true,
    };
    this.gateway.emitToSession(share.sessionId, { type: 'share.participant', payload: evt });

    return { participantId: participant.id, sessionId: share.sessionId, allowControl: share.allowControl };
  }

  async leave(shareKey: string, participantId: string) {
    const share = await this.resolveActiveShare(shareKey);
    const res = await prisma.shareParticipant.updateMany({
      where: { id: participantId, shareId: share.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Participant not found');

    const evt: ShareParticipantEvent = {
      shareId: share.id,
      sessionId: share.sessionId,
      participantId,
      name: '',
      joined: false,
    };
    this.gateway.emitToSession(share.sessionId, { type: 'share.participant', payload: evt });
    return { ok: true };
  }

  /** Post a chat message into a share room and fan it out over the gateway. */
  async postMessage(shareKey: string, dto: PostChatMessageDto, author?: { id?: string; name?: string }) {
    const share = await this.resolveActiveShare(shareKey);
    this.assertAuthAllowed(share, author?.id);
    if (!share.enableChat) throw new BadRequestException('Chat is disabled for this share');

    const authorName = author?.name ?? dto.authorName ?? 'Guest';
    const message = await prisma.shareChatMessage.create({
      data: {
        shareId: share.id,
        authorId: author?.id ?? null,
        authorName,
        body: dto.body,
      },
    });

    const evt: ShareChatEvent = {
      shareId: share.id,
      sessionId: share.sessionId,
      messageId: message.id,
      authorName,
      body: message.body,
      at: message.createdAt.toISOString(),
    };
    this.gateway.emitToSession(share.sessionId, { type: 'share.chat', payload: evt });

    return message;
  }

  async listMessages(shareKey: string, userId?: string) {
    const share = await this.resolveActiveShare(shareKey);
    this.assertAuthAllowed(share, userId);
    return prisma.shareChatMessage.findMany({
      where: { shareId: share.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }
}
