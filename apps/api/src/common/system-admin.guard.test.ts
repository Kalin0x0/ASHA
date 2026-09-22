import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('@asha/db', () => ({ prisma: { user: { findFirst } }, runUnscoped: (fn: () => unknown) => fn() }));
import { SystemAdminGuard } from './system-admin.guard';
import { MaintenanceController } from '../modules/maintenance/maintenance.controller';
import { BackupsController } from '../modules/backups/backups.controller';

describe('global infrastructure authorization', () => {
  const ctx = (user?: object) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
  beforeEach(() => vi.resetAllMocks());
  it('rejects an absent identity without a database call', async () => {
    await expect(new SystemAdminGuard().canActivate(ctx())).rejects.toThrow('System administrator');
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('does not trust the token admin flag or tenant permissions', async () => {
    findFirst.mockResolvedValue(null);
    await expect(new SystemAdminGuard().canActivate(ctx({ sub: 'u', orgId: 'o', isSystemAdmin: true }))).rejects.toThrow();
  });
  it('requires a currently active system admin in the same tenant', async () => {
    findFirst.mockResolvedValue({ id: 'u' });
    await expect(new SystemAdminGuard().canActivate(ctx({ sub: 'u', orgId: 'o' }))).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'u', orgId: 'o', isSystemAdmin: true, status: 'ACTIVE' }, select: { id: true } });
  });
  it.each([MaintenanceController, BackupsController])('guards every global operation on %s', (controller) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(SystemAdminGuard);
  });
});
