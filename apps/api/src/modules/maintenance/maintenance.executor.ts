import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@asha/db';
import { type AgentCommand, RedisChannels } from '@asha/events';
import { RedisService } from '../../common/redis.service';
import { SessionReaperService } from '../sessions/session-reaper.service';

/** The maintenance actions an admin can schedule. Kept as a string union so the
 *  web/api share the values without importing the generated Prisma enum. */
export type MaintenanceTaskType =
  | 'REAP_DEAD_SESSIONS'
  | 'REAP_ABANDONED_SESSIONS'
  | 'PRUNE_DEAD_AGENTS'
  | 'RESTART_AGENTS'
  | 'RESTART_CONNECTION_PROXY'
  | 'PRUNE_AGENT_IMAGES';

export interface TaskCatalogEntry {
  type: MaintenanceTaskType;
  /** CLEANUP acts on the DB directly; RESTART dispatches a command to agents. */
  category: 'CLEANUP' | 'RESTART';
  /** RESTART tasks fire-and-forget over Redis — the outcome is async. */
  dispatch: boolean;
}

/** The catalog the UI renders to let an admin pick a task to schedule. */
export const MAINTENANCE_CATALOG: readonly TaskCatalogEntry[] = [
  { type: 'REAP_DEAD_SESSIONS', category: 'CLEANUP', dispatch: false },
  { type: 'REAP_ABANDONED_SESSIONS', category: 'CLEANUP', dispatch: false },
  { type: 'PRUNE_DEAD_AGENTS', category: 'CLEANUP', dispatch: false },
  { type: 'RESTART_AGENTS', category: 'RESTART', dispatch: true },
  { type: 'RESTART_CONNECTION_PROXY', category: 'RESTART', dispatch: true },
  { type: 'PRUNE_AGENT_IMAGES', category: 'RESTART', dispatch: true },
] as const;

export interface ExecResult {
  status: 'OK' | 'SKIPPED';
  /** Items affected: sessions reaped, agents targeted, services restarted. */
  affected: number;
  summary: string;
}

/**
 * Runs a single maintenance action. Cleanup tasks reuse the existing reaper
 * (so the reaping logic lives in exactly one place); restart/prune tasks
 * publish an {@link AgentCommand} because only the agent holds the Docker
 * socket. Callers wrap execution in `runUnscoped` so effects are system-wide.
 */
@Injectable()
export class MaintenanceExecutor {
  private readonly logger = new Logger('Maintenance');

  constructor(
    private readonly reaper: SessionReaperService,
    private readonly redis: RedisService,
  ) {}

  async run(type: MaintenanceTaskType, _params: Record<string, unknown> = {}): Promise<ExecResult> {
    switch (type) {
      case 'REAP_DEAD_SESSIONS': {
        const n = await this.reaper.reap();
        return { status: 'OK', affected: n, summary: `Finalized ${n} dead session(s) — expired / idle / stuck-terminating` };
      }
      case 'REAP_ABANDONED_SESSIONS': {
        const n = await this.reaper.reapAbandoned();
        return { status: 'OK', affected: n, summary: `Terminated ${n} abandoned session(s)` };
      }
      case 'PRUNE_DEAD_AGENTS': {
        const n = await this.reaper.pruneDeadAgents();
        return { status: 'OK', affected: n, summary: `Pruned ${n} dead agent registration(s)` };
      }
      case 'RESTART_AGENTS': {
        const agents = await prisma.agent.count({ where: { status: { in: ['ONLINE', 'DRAINING'] } } });
        await this.dispatch({ action: 'RESTART_SELF', target: '*' });
        return { status: 'OK', affected: agents, summary: `Restart dispatched to ${agents} agent(s)` };
      }
      case 'RESTART_CONNECTION_PROXY': {
        // Target exactly ONE agent so a co-located service isn't restarted N times.
        const agent = await prisma.agent.findFirst({
          where: { status: 'ONLINE' },
          orderBy: { lastHeartbeatAt: 'desc' },
          select: { id: true },
        });
        if (!agent) {
          return { status: 'SKIPPED', affected: 0, summary: 'No online agent available to run the restart' };
        }
        await this.dispatch({ action: 'RESTART_SERVICE', target: agent.id, services: ['connection-proxy', 'guacd'] });
        return { status: 'OK', affected: 2, summary: 'Restart dispatched for the RDP/VNC/SSH bridge (connection-proxy + guacd)' };
      }
      case 'PRUNE_AGENT_IMAGES': {
        const agents = await prisma.agent.count({ where: { status: { in: ['ONLINE', 'DRAINING'] } } });
        await this.dispatch({ action: 'PRUNE_IMAGES', target: '*' });
        return { status: 'OK', affected: agents, summary: `Dangling-image prune dispatched to ${agents} agent(s)` };
      }
      default:
        return { status: 'SKIPPED', affected: 0, summary: `Unknown task type ${String(type)}` };
    }
  }

  private async dispatch(cmd: AgentCommand): Promise<void> {
    const withNonce: AgentCommand = { ...cmd, nonce: randomUUID() };
    this.logger.log(`dispatching agent command ${cmd.action} → ${cmd.target}`);
    await this.redis.publish(RedisChannels.agentCommand, withNonce);
  }
}
