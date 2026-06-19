import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';

/**
 * Commit-to-Image jobs (A4). Snapshots a running session's container into a new
 * image tag. This service owns the job lifecycle/state machine (verifiable
 * headless); the agent performs the actual `docker commit` + push out-of-band
 * and reports terminal status back.
 */
@Injectable()
export class ImageBuildsService {
  constructor(private readonly audit: AuditService) {}

  async create(orgId: string, actorUserId: string, sessionId: string, requestedTag: string) {
    const session = await prisma.session.findFirst({ where: { id: sessionId, orgId } });
    if (!session) throw new NotFoundException('Session not found');
    const job = await prisma.imageBuildJob.create({
      data: { orgId, sessionId, requestedTag, status: 'PENDING' },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'image.commit',
      targetType: 'ImageBuildJob',
      targetId: job.id,
      metadata: { sessionId, requestedTag },
    });
    return job;
  }

  get(orgId: string, id: string) {
    return prisma.imageBuildJob.findFirst({ where: { id, orgId } });
  }

  list(orgId: string, sessionId?: string) {
    return prisma.imageBuildJob.findMany({
      where: { orgId, ...(sessionId ? { sessionId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
