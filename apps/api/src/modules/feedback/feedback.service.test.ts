import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    feedback: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { FeedbackService } from './feedback.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const USER = { sub: 'u1', orgId: 'org1' } as never;

describe('FeedbackService', () => {
  let svc: FeedbackService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new FeedbackService(audit as never);
  });

  it('creates a report scoped to the org + user, without echoing the screenshot back', async () => {
    prismaMock.feedback.create.mockResolvedValue({ id: 'f1', kind: 'BUG', status: 'OPEN' });
    await svc.create(USER, { kind: 'BUG', message: 'broken', screenshot: 'data:image/png;base64,xxx' });
    const arg = prismaMock.feedback.create.mock.calls[0]![0] as { data: Record<string, unknown>; select: Record<string, unknown> };
    expect(arg.data).toMatchObject({ orgId: 'org1', userId: 'u1', kind: 'BUG', message: 'broken' });
    expect(arg.select.screenshot).toBeUndefined();
  });

  it('appends a note + sets status on update (the shared triage thread)', async () => {
    prismaMock.feedback.findFirst.mockResolvedValue({ id: 'f1', orgId: 'org1', notes: [{ author: 'x', body: 'old', at: 't0' }] });
    prismaMock.feedback.update.mockImplementation(async (a: { data: Record<string, unknown> }) => a.data);

    await svc.update('org1', 'admin1', 'f1', { status: 'FIXED', note: 'done' });

    const data = prismaMock.feedback.update.mock.calls[0]![0] as { data: { status: string; notes: unknown[] } };
    expect(data.data.status).toBe('FIXED');
    expect(data.data.notes).toHaveLength(2);
    expect(data.data.notes[1]).toMatchObject({ author: 'admin1', body: 'done' });
  });

  it('404s when updating feedback from another org', async () => {
    prismaMock.feedback.findFirst.mockResolvedValue(null);
    await expect(svc.update('org1', 'admin1', 'nope', { status: 'OPEN' })).rejects.toThrow(/not found/i);
  });
});
