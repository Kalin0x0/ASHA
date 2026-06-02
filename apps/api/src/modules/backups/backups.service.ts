import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Env } from '@chista/config';
import { prisma } from '@chista/db';
import { ENV } from '../../common/env.module';

/**
 * Automated Postgres backups via the open-source `pg_dump`. The scheduler runs
 * on `BACKUP_CRON` when `BACKUP_ENABLED` is set, writing a custom-format dump
 * into `BACKUP_DIR`, recording it in `DbBackupRecord`, and pruning beyond
 * `BACKUP_RETENTION`. Admins can also trigger a backup on demand.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  list() {
    return prisma.dbBackupRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Cron(process.env.BACKUP_CRON ?? '0 3 * * *', { name: 'db-backup' })
  async scheduled() {
    if (!this.env.BACKUP_ENABLED) return;
    await this.runBackup().catch((err) => this.logger.error(`Scheduled backup failed: ${String(err)}`));
  }

  /** Run a single backup now and record the result. */
  async runBackup() {
    await mkdir(this.env.BACKUP_DIR, { recursive: true });
    const filename = `chista-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
    const filepath = join(this.env.BACKUP_DIR, filename);

    let bytes = 0;
    let status = 'completed';
    try {
      bytes = await this.performDump(filepath);
    } catch (err) {
      status = 'failed';
      this.logger.error(`pg_dump failed: ${String(err)}`);
    }

    const record = await prisma.dbBackupRecord.create({ data: { filename, bytes: BigInt(bytes), status } });
    if (status === 'completed') await this.prune();
    return record;
  }

  /** Invoke pg_dump (custom format) against DATABASE_URL; resolve with byte size. */
  protected performDump(filepath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const child = spawn('pg_dump', ['--format=custom', `--file=${filepath}`, this.env.DATABASE_URL], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (d) => (stderr += String(d)));
      child.on('error', reject);
      child.on('close', async (code) => {
        if (code !== 0) return reject(new Error(stderr || `pg_dump exited ${code}`));
        try {
          resolve((await stat(filepath)).size);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /** Delete dumps beyond the retention count, oldest first. */
  private async prune() {
    let files: string[];
    try {
      files = (await readdir(this.env.BACKUP_DIR)).filter((f) => f.endsWith('.dump'));
    } catch {
      return;
    }
    if (files.length <= this.env.BACKUP_RETENTION) return;
    const sorted = files.sort(); // ISO-timestamped names sort chronologically
    for (const f of sorted.slice(0, files.length - this.env.BACKUP_RETENTION)) {
      await unlink(join(this.env.BACKUP_DIR, f)).catch(() => undefined);
    }
  }
}
