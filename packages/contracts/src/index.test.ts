import { describe, expect, it } from 'vitest';
import {
  agentRegisterSchema,
  createServerSchema,
  createSessionSchema,
  createWorkspaceSchema,
  loginSchema,
  sessionStatusSchema,
  updateServerSchema,
  updateWorkspaceSchema,
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

describe('updateWorkspaceSchema', () => {
  it('accepts a partial update', () => {
    const r = updateWorkspaceSchema.safeParse({ enabled: false });
    expect(r.success).toBe(true);
  });
  it('rejects an empty update (no fields)', () => {
    expect(updateWorkspaceSchema.safeParse({}).success).toBe(false);
  });
  it('does not inject create defaults', () => {
    const r = updateWorkspaceSchema.parse({ friendlyName: 'Renamed' });
    expect(r).toEqual({ friendlyName: 'Renamed' });
    expect('gpuCount' in r).toBe(false);
  });
  it('still validates field types', () => {
    expect(updateWorkspaceSchema.safeParse({ gpuCount: -1 }).success).toBe(false);
    expect(updateWorkspaceSchema.safeParse({ type: 'BOGUS' }).success).toBe(false);
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

describe('the keyboard layout on a server', () => {
  // The value describes the machine and ends up in a guacd connect
  // instruction, which guacd refuses outright for a name it does not know. The
  // API is where that is caught, so a mistake costs a form error and not every
  // session on that host.
  const server = { zoneId: 'z1', hostname: 'win-rdp-01', address: '10.0.0.21' };

  it('accepts a layout guacd knows', () => {
    expect(createServerSchema.safeParse({ ...server, keyboardLayout: 'de-de-qwertz' }).success).toBe(true);
    expect(updateServerSchema.safeParse({ keyboardLayout: 'en-us-qwerty' }).success).toBe(true);
  });

  it('rejects one it does not, however plausible it reads', () => {
    // Austria types on a German keyboard; guacd still ships no de-at-qwertz.
    expect(createServerSchema.safeParse({ ...server, keyboardLayout: 'de-at-qwertz' }).success).toBe(false);
    expect(updateServerSchema.safeParse({ keyboardLayout: 'de-at-qwertz' }).success).toBe(false);
    expect(updateServerSchema.safeParse({ keyboardLayout: 'DE-DE-QWERTZ' }).success).toBe(false);
    expect(updateServerSchema.safeParse({ keyboardLayout: '' }).success).toBe(false);
  });

  it('leaves it alone when omitted and clears it when null', () => {
    // Omitted has to keep meaning "change nothing" — every existing caller
    // sends no layout — while an explicit null is the admin putting the host
    // back on the installation default.
    expect(createServerSchema.safeParse(server).success).toBe(true);
    expect(updateServerSchema.safeParse({ address: '10.0.0.22' }).success).toBe(true);
    expect(updateServerSchema.safeParse({ keyboardLayout: null }).success).toBe(true);
  });
});
