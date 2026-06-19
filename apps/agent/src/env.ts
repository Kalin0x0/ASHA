import os from 'node:os';

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
  memTotalMb: Math.round(os.totalmem() / 1024 / 1024),
  version: '0.1.0',
};

export type AgentEnv = typeof agentEnv;
