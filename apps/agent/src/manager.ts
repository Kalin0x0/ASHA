import type { SessionObservationSample, SessionStatSample } from '@asha/events';
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
      maxSessions: agentEnv.maxSessions,
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
      /** KASMVNC only: whether the container's read-only account really answers. */
      viewerAuth?: boolean;
      error?: string;
    },
  ) {
    return post(`/internal/agents/${agentId}/sessions/${sessionId}/status`, body);
  },

  reportStats(agentId: string, samples: SessionStatSample[]) {
    return post(`/internal/agents/${agentId}/stats`, { samples });
  },

  // Keyed by kasmId, not sessionId: the API holds the sample in Redis under the
  // kasmId, the way everything else on the streaming path is addressed.
  reportObservation(agentId: string, sample: SessionObservationSample) {
    return post<{ ok: true }>(`/internal/agents/${agentId}/sessions/${sample.kasmId}/observation`, sample);
  },
};
