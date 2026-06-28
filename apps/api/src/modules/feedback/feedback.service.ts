import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateFeedbackDto, UpdateFeedbackDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';

interface FeedbackNote {
  author: string;
  body: string;
  at: string;
}

/**
 * Bug reports + feedback, and the shared "memory" admins/agents use to triage
 * them. `update()` flips status and/or appends to a notes thread, so humans and
 * automated agents collaborate on the same record (what to fix / what's fixed).
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly audit: AuditService) {}

  create(user: AuthUser, dto: CreateFeedbackDto) {
    return prisma.feedback.create({
      data: {
        orgId: user.orgId,
        userId: user.sub,
        kind: dto.kind,
        message: dto.message,
        pageUrl: dto.pageUrl,
        screenshot: dto.screenshot,
      },
      // Don't echo the (potentially large) screenshot back on create.
      select: { id: true, kind: true, status: true, createdAt: true },
    });
  }

  list(orgId: string, status?: string) {
    return prisma.feedback.findMany({
      where: { orgId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateFeedbackDto) {
    const existing = await prisma.feedback.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Feedback not found');

    const notes: FeedbackNote[] = Array.isArray(existing.notes) ? (existing.notes as unknown as FeedbackNote[]) : [];
    const nextNotes = dto.note
      ? [...notes, { author: actorUserId, body: dto.note, at: new Date().toISOString() }]
      : notes;

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        notes: nextNotes as object,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'feedback.update',
      targetType: 'Feedback',
      targetId: id,
      metadata: { status: dto.status, note: Boolean(dto.note) },
    });
    return updated;
  }
}
