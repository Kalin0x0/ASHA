import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    logForwarderConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { LogForwardingService } from './log-forwarding.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('LogForwardingService', () => {
  let svc: LogForwardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new LogForwardingService(audit as never);
  });

  it('create records audit with the forwarder type', async () => {
    prismaMock.logForwarderConfig.create.mockResolvedValue({ id: 'f1' });
    await svc.create('org1', 'u1', { name: 'siem', type: 'syslog', config: {}, enabled: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logforwarder.create', metadata: { type: 'syslog' } }),
    );
  });

  it('update throws NotFoundException when nothing matched the org', async () => {
    prismaMock.logForwarderConfig.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.update('org1', 'u1', 'missing', { enabled: false })).rejects.toThrow(NotFoundException);
  });

  it('renders a syslog Fluent Bit config from the endpoint URL', async () => {
    prismaMock.logForwarderConfig.findFirst.mockResolvedValue({
      name: 'siem',
      type: 'syslog',
      endpoint: 'tcp://logs.example.com:1514',
      config: {},
    });
    const { filename, content } = await svc.renderFluentBitConfig('org1', 'f1');
    expect(filename).toBe('fluent-bit-siem.conf');
    expect(content).toContain('Name              syslog');
    expect(content).toContain('Host              logs.example.com');
    expect(content).toContain('Port              1514');
  });

  it('renders an elasticsearch output with a custom index', async () => {
    prismaMock.logForwarderConfig.findFirst.mockResolvedValue({
      name: 'es',
      type: 'elasticsearch',
      endpoint: 'http://es.internal:9200',
      config: { index: 'audit' },
    });
    const { content } = await svc.renderFluentBitConfig('org1', 'f1');
    expect(content).toContain('Name      es');
    expect(content).toContain('Index     audit');
  });

  it('rejects rendering for an unknown forwarder', async () => {
    prismaMock.logForwarderConfig.findFirst.mockResolvedValue(null);
    await expect(svc.renderFluentBitConfig('org1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('rejects a malformed endpoint URL during render', async () => {
    prismaMock.logForwarderConfig.findFirst.mockResolvedValue({
      name: 'bad',
      type: 'http',
      endpoint: 'not a url',
      config: {},
    });
    await expect(svc.renderFluentBitConfig('org1', 'f1')).rejects.toThrow(BadRequestException);
  });
});
