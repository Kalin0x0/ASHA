import os from 'node:os';
import { type DestroyCommand, type ProvisionCommand, RedisChannels } from '@chista/events';
import { createLogger } from '@chista/logger';
import Redis from 'ioredis';
import { collectStats, destroyContainer, provisionContainer } from './docker.js';
import { agentEnv } from './env.js';
import { manager } from './manager.js';

const log = createLogger('agent');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  log.info({ zone: agentEnv.zone, host: agentEnv.hostname, cores: agentEnv.cpuCores }, 'Chista agent starting');

  let agentId = '';
  for (;;) {
    try {
      const result = await manager.register();
      agentId = result.agentId;
      log.info({ agentId, zoneId: result.zoneId }, 'enrolled with manager');
      break;
    } catch (e) {
      log.warn(`register failed: ${(e as Error).message} — retrying in 5s`);
      await sleep(5000);
    }
  }

  const containerBySession = new Map<string, string>();
  const sessionByContainer = new Map<string, string>();

  const sub = new Redis(agentEnv.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  sub.on('error', (e) => log.warn(`redis: ${e.message}`));
  await sub.connect().catch(() => log.warn('redis connect failed — provisioning will be idle'));

  const provisionChannel = RedisChannels.provision(agentEnv.zone);
  const destroyChannel = RedisChannels.destroy(agentEnv.zone);
  await sub.subscribe(provisionChannel, destroyChannel).catch(() => undefined);

  sub.on('message', (channel: string, message: string) => {
    void (async () => {
      try {
        if (channel === provisionChannel) {
          await handleProvision(agentId, JSON.parse(message) as ProvisionCommand, containerBySession, sessionByContainer);
        } else if (channel === destroyChannel) {
          await handleDestroy(agentId, JSON.parse(message) as DestroyCommand, containerBySession, sessionByContainer);
        }
      } catch (e) {
        log.error(`message handling failed: ${(e as Error).message}`);
      }
    })();
  });

  setInterval(() => {
    const memFreeMb = Math.round(os.freemem() / 2 ** 20);
    const load = os.loadavg()[0] ?? 0;
    const loadPercent = Math.min(100, Math.round((load / agentEnv.cpuCores) * 100));
    void manager
      .heartbeat(agentId, { memFreeMb, loadPercent, currentSessions: containerBySession.size })
      .catch(() => undefined);
  }, 10_000);

  setInterval(() => {
    void (async () => {
      if (sessionByContainer.size === 0) return;
      const samples = await collectStats(sessionByContainer);
      if (samples.length) await manager.reportStats(agentId, samples).catch(() => undefined);
    })();
  }, 3000);

  log.info('agent ready — awaiting provision commands');
}

async function handleProvision(
  agentId: string,
  cmd: ProvisionCommand,
  bySession: Map<string, string>,
  byContainer: Map<string, string>,
): Promise<void> {
  log.info({ sessionId: cmd.sessionId, image: cmd.runConfig.dockerImage }, 'provisioning session');
  await manager.reportStatus(agentId, cmd.sessionId, { status: 'PROVISIONING' }).catch(() => undefined);
  try {
    const result = await provisionContainer(cmd);
    bySession.set(cmd.sessionId, result.containerId);
    byContainer.set(result.containerId, cmd.sessionId);
    await manager.reportStatus(agentId, cmd.sessionId, {
      status: 'RUNNING',
      containerId: result.containerId,
      internalHost: result.internalHost,
      port: result.port,
      traefikRouterName: result.routerName,
    });
    log.info({ sessionId: cmd.sessionId }, 'session running');
  } catch (e) {
    log.error(`provision failed: ${(e as Error).message}`);
    await manager
      .reportStatus(agentId, cmd.sessionId, { status: 'ERROR', error: (e as Error).message })
      .catch(() => undefined);
  }
}

async function handleDestroy(
  agentId: string,
  cmd: DestroyCommand,
  bySession: Map<string, string>,
  byContainer: Map<string, string>,
): Promise<void> {
  const containerId = cmd.containerId ?? bySession.get(cmd.sessionId);
  if (containerId) {
    await destroyContainer(containerId);
    byContainer.delete(containerId);
  }
  bySession.delete(cmd.sessionId);
  await manager.reportStatus(agentId, cmd.sessionId, { status: 'DESTROYED' }).catch(() => undefined);
  log.info({ sessionId: cmd.sessionId }, 'session destroyed');
}

void main().catch((e) => {
  log.error(e);
  process.exit(1);
});
