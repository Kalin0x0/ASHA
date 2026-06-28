import os from 'node:os';

// Optional hard override for this agent's scheduling capacity. When unset, the
// manager derives maxSessions from cpuCores (cores/2). Set ASHA_AGENT_MAX_SESSIONS
// to run more (or fewer) concurrent desktops than the CPU-based default.
const maxSessionsOverride = Number(process.env.ASHA_AGENT_MAX_SESSIONS);

export const agentEnv = {
  managerUrl: process.env.ASHA_MANAGER_URL ?? 'http://localhost:4000',
  zone: process.env.ASHA_ZONE ?? 'default',
  enrollmentToken: process.env.ASHA_AGENT_ENROLLMENT_TOKEN ?? 'dev-enrollment-token-change-me',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Docker driver
  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
  sessionNetwork: process.env.ASHA_SESSION_NETWORK ?? 'asha-sessions',
  // Kubernetes driver (ASHA_DRIVER=kubernetes)
  k8sSessionNs: process.env.ASHA_K8S_SESSION_NS ?? 'asha-sessions',
  k8sIngressClass: process.env.ASHA_K8S_INGRESS_CLASS ?? 'traefik',
  domain: process.env.ASHA_TRAEFIK_DOMAIN ?? 'asha.local',
  hostname: process.env.ASHA_AGENT_HOSTNAME ?? os.hostname(),
  cpuCores: os.cpus().length,
  maxSessions:
    Number.isFinite(maxSessionsOverride) && maxSessionsOverride > 0
      ? Math.floor(maxSessionsOverride)
      : undefined,
  memTotalMb: Math.round(os.totalmem() / 1024 / 1024),
  version: '0.1.0',
};

export type AgentEnv = typeof agentEnv;
