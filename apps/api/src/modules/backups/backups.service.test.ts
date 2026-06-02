import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    dbBackupRecord: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));
// Avoid touching the real filesystem in the prune/mkdir paths.
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ size: 0 }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { BackupsService } from './backups.service';

const env = {
  DATABASE_URL: 'postgresql://localhost/chista',
  BACKUP_ENABLED: true,
  BACKUP_DIR: '/tmp/chista-backups',
  BACKUP_CRON: '0 3 * * *',
  BACKUP_RETENTION: 7,
} as Record<string, unknown>;

describe('BackupsService', () => {
  let svc: BackupsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new BackupsService(env as never);
  });

  it('records a completed backup with the dumped byte size', async () => {
    vi.spyOn(svc as never as { performDump: () => Promise<number> }, 'performDump').mockResolvedValue(2048);
    prismaMock.dbBackupRecord.create.mockResolvedValue({ id: 'b1', status: 'completed' });

    await svc.runBackup();

    expect(prismaMock.dbBackupRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bytes: BigInt(2048), status: 'completed' }) }),
    );
  });

  it('records a failed backup when pg_dump throws', async () => {
    vi.spyOn(svc as never as { performDump: () => Promise<number> }, 'performDump').mockRejectedValue(
      new Error('pg_dump missing'),
    );
    prismaMock.dbBackupRecord.create.mockResolvedValue({ id: 'b2', status: 'failed' });

    await svc.runBackup();

    expect(prismaMock.dbBackupRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bytes: BigInt(0), status: 'failed' }) }),
    );
  });

  it('scheduled() is a no-op when backups are disabled', async () => {
    const disabled = new BackupsService({ ...env, BACKUP_ENABLED: false } as never);
    const spy = vi.spyOn(disabled, 'runBackup');
    await disabled.scheduled();
    expect(spy).not.toHaveBeenCalled();
  });
});
