import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    webhook: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    webhookDelivery: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { WebhooksService } from './webhooks.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('WebhooksService', () => {
  let svc: WebhooksService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WebhooksService(audit as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never returns the raw secret, only hasSecret', async () => {
    prismaMock.webhook.create.mockResolvedValue({ id: 'w1', name: 'h', url: 'https://x', secret: 's3cretValue' });
    const res = await svc.create('org1', 'u1', {
      name: 'h',
      url: 'https://x',
      events: ['session.created'],
      secret: 's3cretValue',
      enabled: true,
    });
    expect(res).not.toHaveProperty('secret');
    expect(res).toMatchObject({ id: 'w1', hasSecret: true });
  });

  it('dispatch only fires hooks subscribed to the event', async () => {
    prismaMock.webhook.findMany.mockResolvedValue([]);
    await svc.dispatch('org1', 'session.created', { id: 's1' });
    expect(prismaMock.webhook.findMany).toHaveBeenCalledWith({
      where: { orgId: 'org1', enabled: true, events: { has: 'session.created' } },
    });
  });

  it('signs the payload with HMAC-SHA256 and records a delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.webhook.findMany.mockResolvedValue([
      { id: 'w1', url: 'https://example.com/hook', secret: 'topsecret', enabled: true },
    ]);
    prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'd1' });

    await svc.dispatch('org1', 'session.created', { id: 's1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    // Verify the signature matches an independent HMAC over the exact body sent
    const expected = `sha256=${createHmac('sha256', 'topsecret').update(init.body).digest('hex')}`;
    expect(init.headers['x-chista-signature']).toBe(expected);
    expect(prismaMock.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS', responseCode: 200 }) }),
    );
  });

  it('records a FAILED delivery when the endpoint throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    prismaMock.webhook.findFirst.mockResolvedValue({ id: 'w1', url: 'https://down', secret: null });
    prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'd1' });

    const res = await svc.test('org1', 'w1');
    expect(res.status).toBe('FAILED');
    expect(prismaMock.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('throws 404 deleting a webhook in another org', async () => {
    prismaMock.webhook.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove('org1', 'u1', 'foreign')).rejects.toThrow('not found');
  });
});
