import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { agent: { count: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { MaintenanceExecutor } from './maintenance.executor';

describe('MaintenanceExecutor', () => {
  let reaper: { reap: ReturnType<typeof vi.fn>; reapAbandoned: ReturnType<typeof vi.fn>; pruneDeadAgents: ReturnType<typeof vi.fn> };
  let redis: { publish: ReturnType<typeof vi.fn> };
  let exec: MaintenanceExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    reaper = {
      reap: vi.fn().mockResolvedValue(3),
      reapAbandoned: vi.fn().mockResolvedValue(2),
      pruneDeadAgents: vi.fn().mockResolvedValue(5),
    };
    redis = { publish: vi.fn().mockResolvedValue(undefined) };
    exec = new MaintenanceExecutor(reaper as never, redis as never);
  });

  it('REAP_DEAD_SESSIONS reuses reaper.reap() and reports the count', async () => {
    const r = await exec.run('REAP_DEAD_SESSIONS');
    expect(reaper.reap).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ status: 'OK', affected: 3 });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('REAP_ABANDONED_SESSIONS reuses reaper.reapAbandoned()', async () => {
    const r = await exec.run('REAP_ABANDONED_SESSIONS');
    expect(reaper.reapAbandoned).toHaveBeenCalledTimes(1);
    expect(r.affected).toBe(2);
  });

  it('PRUNE_DEAD_AGENTS reuses reaper.pruneDeadAgents()', async () => {
    const r = await exec.run('PRUNE_DEAD_AGENTS');
    expect(reaper.pruneDeadAgents).toHaveBeenCalledTimes(1);
    expect(r.affected).toBe(5);
  });

  it('RESTART_AGENTS broadcasts RESTART_SELF to all agents', async () => {
    prismaMock.agent.count.mockResolvedValue(2);
    const r = await exec.run('RESTART_AGENTS');
    expect(redis.publish).toHaveBeenCalledWith(
      'asha:agent:command',
      expect.objectContaining({ action: 'RESTART_SELF', target: '*' }),
    );
    expect(r).toMatchObject({ status: 'OK', affected: 2 });
  });

  it('RESTART_CONNECTION_PROXY targets exactly one online agent', async () => {
    prismaMock.agent.findFirst.mockResolvedValue({ id: 'ag1' });
    const r = await exec.run('RESTART_CONNECTION_PROXY');
    expect(redis.publish).toHaveBeenCalledWith(
      'asha:agent:command',
      expect.objectContaining({ action: 'RESTART_SERVICE', target: 'ag1', services: ['connection-proxy', 'guacd'] }),
    );
    expect(r.status).toBe('OK');
  });

  it('RESTART_CONNECTION_PROXY is SKIPPED (no dispatch) when no agent is online', async () => {
    prismaMock.agent.findFirst.mockResolvedValue(null);
    const r = await exec.run('RESTART_CONNECTION_PROXY');
    expect(r.status).toBe('SKIPPED');
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('PRUNE_AGENT_IMAGES broadcasts a dangling-image prune', async () => {
    prismaMock.agent.count.mockResolvedValue(1);
    await exec.run('PRUNE_AGENT_IMAGES');
    expect(redis.publish).toHaveBeenCalledWith(
      'asha:agent:command',
      expect.objectContaining({ action: 'PRUNE_IMAGES', target: '*' }),
    );
  });
});
