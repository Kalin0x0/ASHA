import os from 'node:os';

export const agentEnv = {
  managerUrl: process.env.CHISTA_MANAGER_URL ?? 'http://localhost:4000',
  zone: process.env.CHISTA_ZONE ?? 'default',
  enrollmentToken: process.env.CHISTA_AGENT_ENROLLMENT_TOKEN ?? 'dev-enrollment-token-change-me',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Docker driver
  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
  sessionNetwork: process.env.CHISTA_SESSION_NETWORK ?? 'chista-sessions',
  // Kubernetes driver (CHISTA_DRIVER=kubernetes)
  k8sSessionNs: process.env.CHISTA_K8S_SESSION_NS ?? 'chista-sessions',
  k8sIngressClass: process.env.CHISTA_K8S_INGRESS_CLASS ?? 'traefik',
  domain: process.env.CHISTA_TRAEFIK_DOMAIN ?? 'chista.local',
  hostname: process.env.CHISTA_AGENT_HOSTNAME ?? os.hostname(),
  cpuCores: os.cpus().length,
  memTotalMb: Math.round(os.totalmem() / 1024 / 1024),
  version: '0.1.0',
};

export type AgentEnv = typeof agentEnv;
