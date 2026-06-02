import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Env } from '@chista/config';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { ENV } from '../../common/env.module';

/**
 * Session recordings. The agent (or a future recorder sidecar) drives the
 * lifecycle: `begin` when a session starts recording, `addArtifact` per uploaded
 * segment, `finalize` when the session ends. The admin UI reads via `list`/`get`
 * and resolves playback URLs through `playbackUrl`.
 *
 * When S3 is unconfigured (no credentials), recordings are tracked as metadata
 * only and playback returns a not-configured marker rather than a real URL.
 */
@Injectable()
export class RecordingsService {
  constructor(
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get s3Configured(): boolean {
    return Boolean(this.env.S3_ENDPOINT && this.env.S3_ACCESS_KEY_ID && this.env.S3_SECRET_ACCESS_KEY);
  }

  list(orgId: string) {
    return prisma.recording.findMany({
      where: { orgId },
      orderBy: { startedAt: 'desc' },
      take: 200,
      include: { _count: { select: { artifacts: true } } },
    });
  }

  async get(orgId: string, id: string) {
    const recording = await prisma.recording.findFirst({
      where: { id, orgId },
      include: { artifacts: { orderBy: { segmentNo: 'asc' } } },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    return recording;
  }

  /** Begin a recording for a session (idempotent on the unique sessionId). */
  async begin(orgId: string, sessionId: string, protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH') {
    return prisma.recording.upsert({
      where: { sessionId },
      create: { orgId, sessionId, protocol, status: 'RECORDING' },
      update: { status: 'RECORDING' },
    });
  }

  async addArtifact(
    recordingId: string,
    artifact: { path: string; kind: string; segmentNo?: number; bytes?: number },
  ) {
    const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording) throw new NotFoundException('Recording not found');

    const created = await prisma.recordingArtifact.create({
      data: {
        recordingId,
        path: artifact.path,
        kind: artifact.kind,
        segmentNo: artifact.segmentNo,
        bytes: BigInt(artifact.bytes ?? 0),
      },
    });
    await prisma.recording.update({
      where: { id: recordingId },
      data: { bytes: { increment: BigInt(artifact.bytes ?? 0) } },
    });
    return created;
  }

  async finalize(recordingId: string, durationSec: number) {
    const recording = await prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording) throw new NotFoundException('Recording not found');
    return prisma.recording.update({
      where: { id: recordingId },
      data: { status: 'AVAILABLE', durationSec, finalizedAt: new Date() },
    });
  }

  async remove(user: AuthUser, id: string) {
    const res = await prisma.recording.deleteMany({ where: { id, orgId: user.orgId } });
    if (res.count === 0) throw new NotFoundException('Recording not found');
    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.sub,
      action: 'recording.delete',
      targetType: 'Recording',
      targetId: id,
    });
    return { ok: true };
  }

  /**
   * Resolve a playback URL for a recording's artifacts. With S3 configured this
   * would return presigned GET URLs; without it, a not-configured marker so the
   * UI can show a helpful message instead of a broken player.
   */
  async playbackUrl(orgId: string, id: string) {
    const recording = await this.get(orgId, id);
    if (!this.s3Configured) {
      return {
        configured: false,
        message: 'Object storage is not configured. Set S3_* env vars to enable recording playback.',
        segments: [] as string[],
      };
    }
    const base = `${this.env.S3_ENDPOINT.replace(/\/+$/, '')}/${this.env.S3_BUCKET}`;
    const segments = recording.artifacts
      .filter((a) => a.kind === 'segment')
      .map((a) => `${base}/${a.path}`);
    return { configured: true, segments };
  }
}
