import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    exists: vi.fn(async () => 1),
    quit: vi.fn(async () => undefined),
  },
}));

vi.mock('ioredis', () => ({
  default: class {
    constructor() {
      return redisMock as never;
    }
  },
}));

import { SessionStore } from './session-store.js';

/** A connected store — `connect()` is what flips it healthy. */
async function connectedStore(): Promise<SessionStore> {
  const store = new SessionStore();
  await store.connect();
  return store;
}

describe('isWatchActive — whether the API still holds an observation window', () => {
  beforeEach(() => {
    redisMock.exists.mockClear();
  });

  it('reads the record under the key the API writes', async () => {
    const store = await connectedStore();
    await store.isWatchActive('k1');
    expect(redisMock.exists).toHaveBeenCalledWith('asha:obs:watch:k1');
  });

  it('reports a deleted record as ended', async () => {
    const store = await connectedStore();
    redisMock.exists.mockResolvedValueOnce(0);
    expect(await store.isWatchActive('k1')).toBe(false);
  });

  it('reports a failed read as unknown rather than ended', async () => {
    // The caller closes live observation streams on `false`, so a Redis error
    // that answered `false` would drop every observer on the first hiccup.
    const store = await connectedStore();
    redisMock.exists.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await store.isWatchActive('k1')).toBeNull();
  });

  it('reports a disconnected Redis as unknown without querying it', async () => {
    const store = new SessionStore();
    expect(await store.isWatchActive('k1')).toBeNull();
    expect(redisMock.exists).not.toHaveBeenCalled();
  });
});
