import type { SessionStatSample } from '@asha/events';
import { agentEnv } from './env.js';

const base = `${agentEnv.managerUrl.replace(/\/$/, '')}/api/v1`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-token': agentEnv.enrollmentToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Manager ${path} → ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface RegisterResult {
  agentId: string;
  zoneId: string;
  /** Resolved zone name — the agent subscribes to provision/destroy on this. */
  zoneName: string;
  sessionNetwork: string;
}

export const manager = {
  register(): Promise<RegisterResult> {
    return post<RegisterResult>('/internal/agents/register', {
      enrollmentToken: agentEnv.enrollmentToken,
      hostname: agentEnv.hostname,
      zone: agentEnv.zone,
      cpuCores: agentEnv.cpuCores,
      memTotalMb: agentEnv.memTotalMb,
      version: agentEnv.version,
    });
  },

  heartbeat(agentId: string, body: { memFreeMb: number; loadPercent: number; currentSessions: number }) {
    return post(`/internal/agents/${agentId}/heartbeat`, {
      cpuCores: agentEnv.cpuCores,
      memTotalMb: agentEnv.memTotalMb,
      version: agentEnv.version,
      ...body,
    });
  },

  reportStatus(
    agentId: string,
    sessionId: string,
    body: {
      status: 'PROVISIONING' | 'RUNNING' | 'DEGRADED' | 'PAUSED' | 'DESTROYED' | 'ERROR';
      containerId?: string;
      internalHost?: string;
      host?: string;
      port?: number;
      traefikRouterName?: string;
      error?: string;
    },
  ) {
    return post(`/internal/agents/${agentId}/sessions/${sessionId}/status`, body);
  },

  reportStats(agentId: string, samples: SessionStatSample[]) {
    return post(`/internal/agents/${agentId}/stats`, { samples });
  },
};
