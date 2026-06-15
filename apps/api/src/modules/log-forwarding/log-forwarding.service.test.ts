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
// Reversible stand-ins so the sealing round-trip is observable in assertions.
vi.mock('@chista/crypto', () => ({
  seal: (plaintext: string) => `sealed:${plaintext}`,
  unseal: (stored: string) => stored.replace(/^sealed:/, ''),
}));

import { LogForwardingService } from './log-forwarding.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const env = { SECRET_SEAL_KEY: '0'.repeat(64) } as never;

describe('LogForwardingService', () => {
  let svc: LogForwardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new LogForwardingService(audit as never, env);
  });

  it('create records audit with the forwarder type', async () => {
    prismaMock.logForwarderConfig.create.mockResolvedValue({ id: 'f1' });
    await svc.create('org1', 'u1', { name: 'siem', type: 'syslog', config: {}, enabled: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logforwarder.create', metadata: { type: 'syslog' } }),
    );
  });

  it('seals secret-looking config fields on create (token never stored in plaintext)', async () => {
    prismaMock.logForwarderConfig.create.mockResolvedValue({ id: 'f1' });
    await svc.create('org1', 'u1', {
      name: 'splunk',
      type: 'splunk_hec',
      config: { host: 'splunk.internal', token: 'super-secret-hec' },
      enabled: true,
    });
    const data = prismaMock.logForwarderConfig.create.mock.calls[0][0].data;
    // Non-secret field kept; secret masked in the persisted config copy.
    expect((data.config as Record<string, unknown>).host).toBe('splunk.internal');
    expect(JSON.stringify(data.config)).not.toContain('super-secret-hec');
    // Full config (incl. the secret) lives only in the sealed secretRef.
    expect(data.secretRef).toContain('super-secret-hec');
  });

  it('update throws NotFoundException when nothing matched the org', async () => {
    prismaMock.logForwarderConfig.findFirst.mockResolvedValue(null);
    await expect(svc.update('org1', 'u1', 'missing', { enabled: false })).rejects.toThrow(NotFoundException);
  });

  it('update preserves the stored secret when the incoming config masks it', async () => {
    prismaMock.logForwarderConfig.findFirst.mockResolvedValue({
      id: 'f1',
      orgId: 'org1',
      secretRef: 'sealed:{"host":"splunk.internal","token":"original-secret"}',
      config: { host: 'splunk.internal', token: '••••••••' },
    });
    prismaMock.logForwarderConfig.updateMany.mockResolvedValue({ count: 1 });
    await svc.update('org1', 'u1', 'f1', { config: { host: 'new-host', token: '••••••••' } });
    const data = prismaMock.logForwarderConfig.updateMany.mock.calls[0][0].data;
    // Masked token => unchanged original; host updated.
    expect(data.secretRef).toContain('original-secret');
    expect(data.secretRef).toContain('new-host');
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
