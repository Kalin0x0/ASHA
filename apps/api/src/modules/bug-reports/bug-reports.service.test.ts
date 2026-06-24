import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    bugReport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    bugFix: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@asha/db', () => ({
  prisma: prismaMock,
  // runUnscoped just executes the callback in tests.
  runUnscoped: <T>(fn: () => T) => fn(),
}));

import { BugReportsService } from './bug-reports.service';

const user = { sub: 'u1', orgId: 'org1', email: 'admin@chista.local', isSystemAdmin: true };

describe('BugReportsService', () => {
  let svc: BugReportsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new BugReportsService();
    prismaMock.bugFix.updateMany.mockResolvedValue({ count: 0 });
  });

  it('create() stamps a USER report with a quotable error code', async () => {
    prismaMock.bugReport.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'b1',
      ...data,
    }));
    const out = await svc.create(user as never, { title: 'Login is broken', description: 'fails' });
    const arg = prismaMock.bugReport.create.mock.calls[0][0].data;
    expect(arg.source).toBe('USER');
    expect(arg.orgId).toBe('org1');
    expect(arg.errorCode).toMatch(/^ERR-[0-9A-F]{8}$/);
    expect(out.id).toBe('b1');
  });

  it('ingest() dedupes a recurrence by fingerprint instead of inserting', async () => {
    prismaMock.bugReport.findFirst.mockResolvedValue({ id: 'existing', occurrences: 2 });
    prismaMock.bugReport.update.mockResolvedValue({ id: 'existing', occurrences: 3 });

    const res = await svc.ingest('org1', { message: 'Boom', errorName: 'TypeError', component: 'api' });

    expect(prismaMock.bugReport.create).not.toHaveBeenCalled();
    expect(prismaMock.bugReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing' }, data: expect.objectContaining({ occurrences: { increment: 1 } }) }),
    );
    expect((res as { deduped: boolean }).deduped).toBe(true);
  });

  it('ingest() creates a new AUTOMATIC report when none matches', async () => {
    prismaMock.bugReport.findFirst.mockResolvedValue(null);
    prismaMock.bugReport.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'new',
      ...data,
    }));
    const res = await svc.ingest('org1', { message: 'Boom', errorName: 'TypeError', component: 'api', httpStatus: 500 });
    const arg = prismaMock.bugReport.create.mock.calls[0][0].data;
    expect(arg.source).toBe('AUTOMATIC');
    expect(arg.severity).toBe('HIGH'); // 5xx → HIGH
    expect((res as { deduped: boolean }).deduped).toBe(false);
  });

  it('the same error signature produces a stable error code', async () => {
    prismaMock.bugReport.findFirst.mockResolvedValue(null);
    prismaMock.bugReport.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => data);
    const a = await svc.ingest('org1', { message: 'x', errorName: 'E', component: 'api' });
    const b = await svc.ingest('org1', { message: 'x', errorName: 'E', component: 'api' });
    expect((a as { errorCode: string }).errorCode).toBe((b as { errorCode: string }).errorCode);
  });

  it('recordAutomatic() returns an error code synchronously', () => {
    prismaMock.bugReport.findFirst.mockResolvedValue(null);
    prismaMock.bugReport.create.mockResolvedValue({ id: 'x' });
    const { errorCode } = svc.recordAutomatic('org1', { message: 'crash', errorName: 'Error', component: 'api' });
    expect(errorCode).toMatch(/^ERR-[0-9A-F]{8}$/);
  });

  it('resolve() writes the fix into memory and links the report', async () => {
    prismaMock.bugReport.findFirst.mockResolvedValue({ id: 'b1', orgId: 'org1', title: 'T', fingerprint: 'fp1' });
    prismaMock.bugFix.create.mockResolvedValue({ id: 'fix1' });
    prismaMock.bugReport.update.mockResolvedValue({ id: 'b1', status: 'RESOLVED', fixId: 'fix1' });

    await svc.resolve(user as never, 'b1', { rootCause: 'because', resolution: 'patched', authoredBy: 'AI' });

    const fixArg = prismaMock.bugFix.create.mock.calls[0][0].data;
    expect(fixArg.fingerprint).toBe('fp1');
    expect(fixArg.authoredBy).toBe('AI');
    expect(prismaMock.bugReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED', fixId: 'fix1' }) }),
    );
  });

  it('get() surfaces a prior fix (the memory) for an unresolved recurrence', async () => {
    prismaMock.bugReport.findFirst.mockResolvedValue({ id: 'b2', orgId: 'org1', fingerprint: 'fp1', fix: null });
    prismaMock.bugFix.findFirst.mockResolvedValue({ id: 'fix1', title: 'prior' });

    const out = await svc.get(user as never, 'b2');
    expect(prismaMock.bugFix.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org1', fingerprint: 'fp1' } }),
    );
    expect(out.knownFix).toEqual({ id: 'fix1', title: 'prior' });
  });
});
