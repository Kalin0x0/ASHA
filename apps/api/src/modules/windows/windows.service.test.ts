import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    remoteApp: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workspace: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { WindowsService } from './windows.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('WindowsService', () => {
  let svc: WindowsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WindowsService(audit as never);
  });

  it('listRemoteApps filters by workspaceId and orgId', async () => {
    prismaMock.remoteApp.findMany.mockResolvedValue([]);
    await svc.listRemoteApps('org1', 'ws1');
    expect(prismaMock.remoteApp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws1', workspace: { orgId: 'org1' } } }),
    );
  });

  it('createRemoteApp throws NotFoundException when workspace not in org', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    await expect(
      svc.createRemoteApp('org1', 'u1', { workspaceId: 'ws1', name: 'Notepad', path: 'notepad.exe' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createRemoteApp records audit after creation', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.remoteApp.create.mockResolvedValue({ id: 'a1', workspaceId: 'ws1', name: 'Notepad', path: 'notepad.exe' });
    await svc.createRemoteApp('org1', 'u1', { workspaceId: 'ws1', name: 'Notepad', path: 'notepad.exe' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remoteapp.create', targetType: 'RemoteApp', targetId: 'a1' }),
    );
  });

  it('updateRemoteApp throws NotFoundException when app not in org/workspace', async () => {
    prismaMock.remoteApp.findFirst.mockResolvedValue(null);
    await expect(svc.updateRemoteApp('org1', 'u1', 'ws1', 'missing', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('updateRemoteApp returns updated app', async () => {
    const app = { id: 'a1', workspaceId: 'ws1', name: 'Updated', path: 'p.exe' };
    prismaMock.remoteApp.findFirst.mockResolvedValue(app);
    prismaMock.remoteApp.update.mockResolvedValue(app);
    const result = await svc.updateRemoteApp('org1', 'u1', 'ws1', 'a1', { name: 'Updated' });
    expect(result).toEqual(app);
  });

  it('removeRemoteApp throws NotFoundException when app not found', async () => {
    prismaMock.remoteApp.findFirst.mockResolvedValue(null);
    await expect(svc.removeRemoteApp('org1', 'u1', 'ws1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('removeRemoteApp returns ok:true on success', async () => {
    prismaMock.remoteApp.findFirst.mockResolvedValue({ id: 'a1' });
    prismaMock.remoteApp.delete.mockResolvedValue({ id: 'a1' });
    const result = await svc.removeRemoteApp('org1', 'u1', 'ws1', 'a1');
    expect(result).toEqual({ ok: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remoteapp.delete' }),
    );
  });
});
