import os from 'node:os';
import {
  type AgentCommand,
  type DestroyCommand,
  type ImageCommand,
  type ProvisionCommand,
  RedisChannels,
  type SessionControlCommand,
} from '@asha/events';
import { createLogger } from '@asha/logger';
import Redis from 'ioredis';
import { agentEnv } from './env.js';
import { manager } from './manager.js';

const log = createLogger('agent');

// Select the container driver at startup. ASHA_DRIVER=kubernetes switches
// the agent from Docker to ephemeral Kubernetes Pods. All other code is
// identical since both modules export the same provisionContainer / destroyContainer
// / collectStats / pauseContainer / unpauseContainer / resizeContainer interface.
const driver = process.env.ASHA_DRIVER === 'kubernetes'
  ? await import('./kubernetes.js')
  : await import('./docker.js');
const {
  provisionContainer,
  destroyContainer,
  collectStats,
  pauseContainer,
  unpauseContainer,
  resizeContainer,
  applyStreamProfile,
  startRecorder,
  stopRecorder,
  removeImage,
  pullImage,
} = driver;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  log.info({ zone: agentEnv.zone, host: agentEnv.hostname, cores: agentEnv.cpuCores }, 'Asha agent starting');

  let agentId = '';
  // Default to the local zone; replaced by the zone the manager actually
  // enrolled us into so we listen on the same channels it publishes on.
  let zoneName = agentEnv.zone;
  for (;;) {
    try {
      const result = await manager.register();
      agentId = result.agentId;
      zoneName = result.zoneName ?? agentEnv.zone;
      log.info({ agentId, zoneId: result.zoneId, zone: zoneName }, 'enrolled with manager');
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

  const provisionChannel = RedisChannels.provision(zoneName);
  const destroyChannel = RedisChannels.destroy(zoneName);
  const controlChannel = RedisChannels.control(zoneName);
  const imageChannel = RedisChannels.image(zoneName);
  // Broadcast maintenance channel — shared by ALL agents (not zone-scoped); the
  // command's `target` decides whether this agent acts.
  const commandChannel = RedisChannels.agentCommand;
  const channels = [provisionChannel, destroyChannel, controlChannel, imageChannel, commandChannel];
  // Resilient subscribe: retry until it succeeds. A swallowed first-subscribe
  // failure (the old `.catch(() => undefined)`) left the agent silently DEAF —
  // heartbeats kept it ONLINE so the scheduler placed sessions on it, and every
  // launch then timed out with "Launch timed out before the workspace was ready".
  const subscribeAll = async (): Promise<void> => {
    for (let attempt = 1; ; attempt++) {
      try {
        await sub.subscribe(...channels);
        log.info({ zone: zoneName }, 'subscribed to provision/destroy/control/image/command channels');
        return;
      } catch (e) {
        const delay = Math.min(5000 * attempt, 60_000);
        log.error(`redis subscribe failed (attempt ${attempt}): ${(e as Error).message} — retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  };
  await subscribeAll();
  // ioredis auto-resubscribes on reconnect, but re-run explicitly on every
  // (re)connect so a drop before the first successful subscribe can never leave
  // the agent permanently deaf to provision commands.
  sub.on('ready', () => void subscribeAll());

  sub.on('message', (channel: string, message: string) => {
    void (async () => {
      try {
        if (channel === provisionChannel) {
          await handleProvision(agentId, JSON.parse(message) as ProvisionCommand, containerBySession, sessionByContainer);
        } else if (channel === destroyChannel) {
          await handleDestroy(agentId, JSON.parse(message) as DestroyCommand, containerBySession, sessionByContainer);
        } else if (channel === controlChannel) {
          await handleControl(agentId, JSON.parse(message) as SessionControlCommand, containerBySession);
        } else if (channel === imageChannel) {
          await handleImage(JSON.parse(message) as ImageCommand);
        } else if (channel === commandChannel) {
          await handleAgentCommand(agentId, JSON.parse(message) as AgentCommand);
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
  let result;
  try {
    result = await provisionContainer(cmd);
  } catch (e) {
    // The container itself failed to come up — report ERROR.
    log.error(`provision failed: ${(e as Error).message}`);
    await manager
      .reportStatus(agentId, cmd.sessionId, { status: 'ERROR', error: (e as Error).message })
      .catch(() => undefined);
    return;
  }

  // The container is up and tracked. A transient failure to report RUNNING must
  // NOT flip the session to ERROR (the container is healthy) — log and let the
  // next heartbeat reconcile instead.
  bySession.set(cmd.sessionId, result.containerId);
  byContainer.set(result.containerId, cmd.sessionId);
  log.info({ sessionId: cmd.sessionId }, 'session running');
  await manager
    .reportStatus(agentId, cmd.sessionId, {
      status: 'RUNNING',
      containerId: result.containerId,
      internalHost: result.internalHost,
      port: result.port,
      traefikRouterName: result.routerName,
    })
    .catch((e) =>
      log.warn(`failed to report RUNNING for ${cmd.sessionId}: ${(e as Error).message} — container is up; will reconcile on heartbeat`),
    );
}

async function handleControl(
  agentId: string,
  cmd: SessionControlCommand,
  bySession: Map<string, string>,
): Promise<void> {
  const containerId = cmd.containerId ?? bySession.get(cmd.sessionId);
  if (!containerId) {
    log.warn(`control ${cmd.action} for unknown session ${cmd.sessionId}`);
    return;
  }
  try {
    if (cmd.action === 'PAUSE') {
      await pauseContainer(containerId);
      await manager.reportStatus(agentId, cmd.sessionId, { status: 'PAUSED', containerId }).catch(() => undefined);
      log.info({ sessionId: cmd.sessionId }, 'session paused');
    } else if (cmd.action === 'RESUME') {
      await unpauseContainer(containerId);
      await manager.reportStatus(agentId, cmd.sessionId, { status: 'RUNNING', containerId }).catch(() => undefined);
      log.info({ sessionId: cmd.sessionId }, 'session resumed');
    } else if (cmd.action === 'RESIZE') {
      await resizeContainer(containerId, cmd.width ?? 1280, cmd.height ?? 720);
      log.info({ sessionId: cmd.sessionId, w: cmd.width, h: cmd.height }, 'session resized');
    } else if (cmd.action === 'STREAM') {
      await applyStreamProfile(containerId, cmd.streamProfile ?? {});
      log.info({ sessionId: cmd.sessionId, profile: cmd.streamProfile }, 'stream profile applied');
    } else if (cmd.action === 'RECORD_START') {
      await startRecorder(containerId, cmd.sessionId, cmd.recordingId ?? '');
      log.info({ sessionId: cmd.sessionId, recordingId: cmd.recordingId }, 'recording started');
    } else if (cmd.action === 'RECORD_STOP') {
      await stopRecorder(cmd.sessionId);
      log.info({ sessionId: cmd.sessionId, recordingId: cmd.recordingId }, 'recording stopped');
    }

  } catch (e) {
    log.error(`control ${cmd.action} failed: ${(e as Error).message}`);
  }
}

async function handleImage(cmd: ImageCommand): Promise<void> {
  try {
    if (cmd.action === 'REMOVE') {
      const res = await removeImage(cmd.dockerImage, { prune: cmd.prune });
      const mb = Math.round(res.freedBytes / 2 ** 20);
      if (res.removed) log.info({ image: cmd.dockerImage, freedMb: mb }, 'image removed from host');
      else log.info({ image: cmd.dockerImage }, 'image already absent — nothing to reclaim');
    } else if (cmd.action === 'PULL') {
      await pullImage(cmd.dockerImage);
      log.info({ image: cmd.dockerImage }, 'image pulled');
    }
  } catch (e) {
    log.error(`image ${cmd.action} for ${cmd.dockerImage} failed: ${(e as Error).message}`);
  }
}

/**
 * Host-maintenance command handler (scheduler-driven). Only the agent holds the
 * Docker socket, so restarts/prunes the API can't do itself land here. `target`
 * filters which agent acts ('*' = all). RESTART_SERVICE/PRUNE_IMAGES are
 * Docker-specific, so they're skipped on the Kubernetes driver.
 */
async function handleAgentCommand(agentId: string, cmd: AgentCommand): Promise<void> {
  if (cmd.target && cmd.target !== '*' && cmd.target !== agentId) return;

  if (cmd.action === 'RESTART_SELF') {
    // Exit cleanly; the container's `restart: unless-stopped` policy brings it
    // back fresh (it re-enrolls with the manager on boot). Short delay so the
    // log line flushes and any in-flight ack completes.
    log.warn({ agentId, nonce: cmd.nonce }, 'maintenance: restarting agent process on request');
    setTimeout(() => process.exit(0), 750);
    return;
  }

  if (process.env.ASHA_DRIVER === 'kubernetes') {
    log.warn(`maintenance: ${cmd.action} is Docker-only — ignored on the kubernetes driver`);
    return;
  }
  const dockerDriver = await import('./docker.js');

  try {
    if (cmd.action === 'RESTART_SERVICE') {
      const services = cmd.services?.length ? cmd.services : ['connection-proxy', 'guacd'];
      const { restarted } = await dockerDriver.restartComposeService(services);
      log.info({ services, restarted, nonce: cmd.nonce }, 'maintenance: restarted service container(s)');
    } else if (cmd.action === 'PRUNE_IMAGES') {
      const { reclaimedBytes } = await dockerDriver.pruneDanglingImages();
      log.info(
        { reclaimedMb: Math.round(reclaimedBytes / 2 ** 20), nonce: cmd.nonce },
        'maintenance: pruned dangling images',
      );
    }
  } catch (e) {
    log.error(`maintenance command ${cmd.action} failed: ${(e as Error).message}`);
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
