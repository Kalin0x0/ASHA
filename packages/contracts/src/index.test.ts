import { describe, expect, it } from 'vitest';
import {
  agentRegisterSchema,
  createSessionSchema,
  createWorkspaceSchema,
  loginSchema,
  sessionStatusSchema,
} from './index';

describe('loginSchema', () => {
  it('accepts a valid credential pair', () => {
    expect(loginSchema.safeParse({ email: 'a@b.c', password: 'pw' }).success).toBe(true);
  });
  it('allows an optional totp', () => {
    expect(loginSchema.safeParse({ email: 'a@b.c', password: 'pw', totp: '123456' }).success).toBe(true);
  });
  it('rejects an empty email or password', () => {
    expect(loginSchema.safeParse({ email: '', password: 'pw' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.c', password: '' }).success).toBe(false);
  });
});

describe('createSessionSchema', () => {
  it('requires a workspaceId', () => {
    expect(createSessionSchema.safeParse({}).success).toBe(false);
    expect(createSessionSchema.safeParse({ workspaceId: 'ws-1' }).success).toBe(true);
  });
});

describe('createWorkspaceSchema', () => {
  it('applies sensible defaults', () => {
    const parsed = createWorkspaceSchema.parse({ name: 'firefox', friendlyName: 'Firefox' });
    expect(parsed.type).toBe('CONTAINER');
    expect(parsed.gpuCount).toBe(0);
    expect(parsed.categories).toEqual([]);
    expect(parsed.dockerConfig).toEqual({});
  });

  it('rejects an unknown workspace type', () => {
    const result = createWorkspaceSchema.safeParse({
      name: 'x',
      friendlyName: 'X',
      type: 'BOGUS',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative gpuCount', () => {
    const result = createWorkspaceSchema.safeParse({ name: 'x', friendlyName: 'X', gpuCount: -1 });
    expect(result.success).toBe(false);
  });
});

describe('agentRegisterSchema', () => {
  it('accepts a valid enrollment payload', () => {
    const result = agentRegisterSchema.safeParse({
      enrollmentToken: 'tok',
      hostname: 'agent-1',
      zone: 'default',
      cpuCores: 8,
      memTotalMb: 16384,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe('0.1.0');
  });

  it('rejects non-integer or zero cpu cores', () => {
    expect(
      agentRegisterSchema.safeParse({
        enrollmentToken: 'tok',
        hostname: 'a',
        zone: 'default',
        cpuCores: 0,
        memTotalMb: 1024,
      }).success,
    ).toBe(false);
  });
});

describe('sessionStatusSchema', () => {
  it('accepts a known status', () => {
    expect(sessionStatusSchema.safeParse({ status: 'RUNNING' }).success).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(sessionStatusSchema.safeParse({ status: 'SLEEPING' }).success).toBe(false);
  });
});
