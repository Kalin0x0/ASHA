import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, runUnscoped } from '@chista/db';
import type { AuthUser } from '../../common/decorators';

export type BugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BugStatus =
  | 'OPEN'
  | 'TRIAGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'WONT_FIX'
  | 'DUPLICATE';

export interface CreateBugInput {
  title: string;
  description: string;
  severity?: BugSeverity;
  route?: string;
  component?: string;
  appVersion?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/** Shape posted by the web error boundary / window error handlers and the API filter. */
export interface IngestErrorInput {
  errorName?: string;
  message: string;
  stack?: string;
  route?: string;
  component?: string; // 'web' | 'api' | 'agent'
  appVersion?: string;
  userAgent?: string;
  httpStatus?: number;
  severity?: BugSeverity;
  metadata?: Record<string, unknown>;
}

export interface ResolveBugInput {
  rootCause: string;
  resolution: string;
  prevention?: string;
  filesTouched?: string[];
  commitRef?: string;
  authoredBy?: 'AI' | 'HUMAN';
  authorName?: string;
  tags?: string[];
}

export interface ListBugFilter {
  status?: BugStatus;
  severity?: BugSeverity;
  source?: 'USER' | 'AUTOMATIC';
  q?: string;
}

// Statuses that still represent "live" problems — recurrences fold into these
// rather than spawning a duplicate row.
const ACTIVE_STATUSES: BugStatus[] = ['OPEN', 'TRIAGED', 'IN_PROGRESS'];

/**
 * Collapse a free-text message into a stable signature: lowercase, strip hex
 * blobs / uuids / long digit runs so "…reading 'id' at 0x4f2a" and the same
 * error from a different request share a fingerprint.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, '0x')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\b[0-9a-f]{12,}\b/g, '<hash>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** First meaningful stack frame, normalized, so the same crash site groups together. */
function topFrame(stack?: string): string {
  if (!stack) return '';
  const line = stack
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('at '));
  return line ? normalize(line.replace(/:\d+:\d+/g, '')) : '';
}

function fingerprintOf(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/** A short, human-quotable code so a user can reference a specific failure. */
function errorCodeFrom(fingerprint: string): string {
  return `ERR-${fingerprint.slice(0, 8).toUpperCase()}`;
}

/** Deterministic {fingerprint, errorCode} for a captured error — agrees across calls. */
function signatureFor(dto: IngestErrorInput): { fingerprint: string; errorCode: string } {
  const fingerprint = fingerprintOf([
    dto.component ?? 'web',
    (dto.errorName ?? '').toLowerCase(),
    normalize(dto.message),
    topFrame(dto.stack),
  ]);
  return { fingerprint, errorCode: errorCodeFrom(fingerprint) };
}

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger('BugReports');

  // ── Reads ──────────────────────────────────────────────────────────────────

  async list(user: AuthUser, filter: ListBugFilter = {}) {
    const reports = await prisma.bugReport.findMany({
      where: {
        orgId: user.orgId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.severity ? { severity: filter.severity } : {}),
        ...(filter.source ? { source: filter.source } : {}),
        ...(filter.q
          ? {
              OR: [
                { title: { contains: filter.q, mode: 'insensitive' } },
                { description: { contains: filter.q, mode: 'insensitive' } },
                { errorCode: { contains: filter.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { fix: true },
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
      take: 500,
    });
    return reports;
  }

  async stats(user: AuthUser) {
    const rows = await prisma.bugReport.groupBy({
      by: ['status'],
      where: { orgId: user.orgId },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    const [open, critical, automatic, resolved, fixes] = await Promise.all([
      prisma.bugReport.count({ where: { orgId: user.orgId, status: { in: ACTIVE_STATUSES } } }),
      prisma.bugReport.count({
        where: { orgId: user.orgId, severity: 'CRITICAL', status: { in: ACTIVE_STATUSES } },
      }),
      prisma.bugReport.count({ where: { orgId: user.orgId, source: 'AUTOMATIC' } }),
      prisma.bugReport.count({ where: { orgId: user.orgId, status: 'RESOLVED' } }),
      prisma.bugFix.count({ where: { orgId: user.orgId } }),
    ]);
    return { open, critical, automatic, resolved, knowledgeEntries: fixes, byStatus };
  }

  async get(user: AuthUser, id: string) {
    const report = await prisma.bugReport.findFirst({
      where: { id, orgId: user.orgId },
      include: { fix: true },
    });
    if (!report) throw new NotFoundException('Bug report not found');
    // The "memory": if THIS report isn't linked to a fix yet, look for a prior
    // fix with the same fingerprint so the operator/AI sees it was solved before.
    const knownFix =
      !report.fix && report.fingerprint
        ? await prisma.bugFix.findFirst({
            where: { orgId: user.orgId, fingerprint: report.fingerprint },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    return { ...report, knownFix };
  }

  // ── Fix memory (knowledge base) ──────────────────────────────────────────────

  async listKnowledge(user: AuthUser, q?: string) {
    return prisma.bugFix.findMany({
      where: {
        orgId: user.orgId,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { rootCause: { contains: q, mode: 'insensitive' } },
                { resolution: { contains: q, mode: 'insensitive' } },
                { tags: { has: q } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { reports: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  }

  // ── Writes ───────────────────────────────────────────────────────────────────

  /** A human-filed report from the portal / admin UI. */
  async create(user: AuthUser, dto: CreateBugInput) {
    const fingerprint = fingerprintOf(['user', normalize(dto.title)]);
    return prisma.bugReport.create({
      data: {
        orgId: user.orgId,
        source: 'USER',
        status: 'OPEN',
        severity: dto.severity ?? 'MEDIUM',
        title: dto.title,
        description: dto.description,
        fingerprint,
        errorCode: errorCodeFrom(fingerprint),
        component: dto.component ?? 'web',
        route: dto.route ?? null,
        appVersion: dto.appVersion ?? null,
        userAgent: dto.userAgent ?? null,
        reportedById: user.sub,
        reporterEmail: user.email,
        metadata: (dto.metadata ?? {}) as object,
      },
      include: { fix: true },
    });
  }

  /**
   * Intake for an automatically-captured error (web error boundary, window
   * handlers, or the API exception filter via {@link recordAutomatic}). Dedupes
   * by fingerprint: a recurrence bumps occurrences + lastSeenAt instead of
   * inserting a new row. Always carries an errorCode the user can quote.
   */
  async ingest(orgId: string | null, dto: IngestErrorInput, reporter?: { id?: string; email?: string }) {
    const { fingerprint, errorCode } = signatureFor(dto);

    return runUnscoped(async () => {
      const existing = await prisma.bugReport.findFirst({
        where: { orgId, fingerprint, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        const updated = await prisma.bugReport.update({
          where: { id: existing.id },
          data: { occurrences: { increment: 1 }, lastSeenAt: new Date() },
        });
        // A recurrence of something we've fixed before bumps the fix's reuse signal.
        await this.bumpKnownFix(orgId, fingerprint);
        return { ...updated, deduped: true };
      }

      const created = await prisma.bugReport.create({
        data: {
          orgId,
          source: 'AUTOMATIC',
          status: 'OPEN',
          severity: dto.severity ?? (dto.httpStatus && dto.httpStatus >= 500 ? 'HIGH' : 'MEDIUM'),
          title: dto.errorName ? `${dto.errorName}: ${dto.message}`.slice(0, 240) : dto.message.slice(0, 240),
          description: dto.message,
          errorName: dto.errorName ?? null,
          stackTrace: dto.stack ?? null,
          fingerprint,
          errorCode,
          component: dto.component ?? 'web',
          route: dto.route ?? null,
          httpStatus: dto.httpStatus ?? null,
          userAgent: dto.userAgent ?? null,
          appVersion: dto.appVersion ?? null,
          reportedById: reporter?.id ?? null,
          reporterEmail: reporter?.email ?? null,
          metadata: (dto.metadata ?? {}) as object,
        },
      });
      await this.bumpKnownFix(orgId, fingerprint);
      return { ...created, deduped: false };
    });
  }

  /**
   * Best-effort capture used by the global exception filter. Returns the quotable
   * error code synchronously (so the HTTP response can carry it) while persisting
   * the report in the background. Never throws — a failure to record a crash must
   * not turn into a second crash.
   */
  recordAutomatic(
    orgId: string | null,
    dto: IngestErrorInput,
    reporter?: { id?: string; email?: string },
  ): { errorCode: string } {
    const { errorCode } = signatureFor(dto);
    void this.ingest(orgId, dto, reporter).catch((err) => {
      this.logger.warn(`Failed to record automatic bug report: ${(err as Error).message}`);
    });
    return { errorCode };
  }

  async update(
    user: AuthUser,
    id: string,
    dto: { status?: BugStatus; severity?: BugSeverity },
  ) {
    const target = await prisma.bugReport.findFirst({ where: { id, orgId: user.orgId } });
    if (!target) throw new NotFoundException('Bug report not found');
    return prisma.bugReport.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.severity ? { severity: dto.severity } : {}),
        ...(dto.status === 'RESOLVED' && !target.resolvedAt ? { resolvedAt: new Date() } : {}),
      },
      include: { fix: true },
    });
  }

  /**
   * Resolve a report AND write it into the fix memory: records WHAT it was
   * (rootCause) and HOW it was fixed (resolution) so a future recurrence — found
   * by the shared fingerprint — surfaces this entry automatically.
   */
  async resolve(user: AuthUser, id: string, dto: ResolveBugInput) {
    const report = await prisma.bugReport.findFirst({ where: { id, orgId: user.orgId } });
    if (!report) throw new NotFoundException('Bug report not found');

    const fix = await prisma.bugFix.create({
      data: {
        orgId: user.orgId,
        fingerprint: report.fingerprint,
        title: report.title.slice(0, 200),
        rootCause: dto.rootCause,
        resolution: dto.resolution,
        prevention: dto.prevention ?? null,
        filesTouched: dto.filesTouched ?? [],
        commitRef: dto.commitRef ?? null,
        authoredBy: dto.authoredBy ?? 'HUMAN',
        authorName: dto.authorName ?? user.email,
        tags: dto.tags ?? [],
      },
    });

    const updated = await prisma.bugReport.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), fixId: fix.id },
      include: { fix: true },
    });
    return updated;
  }

  /** Increment the reuse counter on a stored fix when its fingerprint reappears. */
  private async bumpKnownFix(orgId: string | null, fingerprint: string) {
    await prisma.bugFix
      .updateMany({ where: { orgId, fingerprint }, data: { reusedCount: { increment: 1 } } })
      .catch(() => undefined);
  }
}
