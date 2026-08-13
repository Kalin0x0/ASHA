import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Approval-gated self-service sign-up: a request is NOT an account until an
// admin approves it. These tests pin the properties that keep that true.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    org: { findFirst: vi.fn() },
    setting: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn() },
    group: { findFirst: vi.fn() },
    userGroup: { create: vi.fn() },
    workspace: { findMany: vi.fn() },
    workspaceUser: { create: vi.fn() },
    accountRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
// Opaque like a real bcrypt digest — deliberately does NOT embed the plaintext,
// so the "never persist the plaintext" assertion below actually means something.
vi.mock('@asha/crypto', () => ({ hashPassword: vi.fn(async (p: string) => `$2b$12$${p.length}`) }));

import { AccountRequestsService } from './account-requests.service';

const ORG = { id: 'org1' };
const ADMIN = { sub: 'admin1', orgId: 'org1', email: 'a@x.io', isSystemAdmin: true } as never;
const SUBMIT = { email: 'Visitor@Example.com', password: 'correct-horse-battery', reason: 'evaluating' };

function makeService() {
  const security = { emit: vi.fn().mockResolvedValue(undefined) };
  return { svc: new AccountRequestsService(security as never), security };
}

/** Runs the interactive $transaction callback against the mock client. */
function passthroughTransaction() {
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.org.findFirst.mockResolvedValue(ORG);
  // Feature switched ON for most cases; the default-OFF case asserts separately.
  prismaMock.setting.findUnique.mockResolvedValue({ valueJson: true });
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.accountRequest.findUnique.mockResolvedValue(null);
  prismaMock.accountRequest.create.mockResolvedValue({ id: 'req1' });
  prismaMock.accountRequest.update.mockResolvedValue({ id: 'req1' });
  prismaMock.accountRequest.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.accountRequest.count.mockResolvedValue(0);
  prismaMock.group.findFirst.mockResolvedValue({ id: 'grp-demo' });
  prismaMock.userGroup.create.mockResolvedValue({});
  prismaMock.workspace.findMany.mockResolvedValue([]);
  prismaMock.workspaceUser.create.mockResolvedValue({});
  passthroughTransaction();
});

describe('AccountRequestsService — public submit', () => {
  it('is disabled by default: no Setting row means no public sign-up', async () => {
    prismaMock.setting.findUnique.mockResolvedValue(null);
    const { svc } = makeService();
    await expect(svc.submit(SUBMIT)).rejects.toThrow(/disabled/i);
    expect(prismaMock.accountRequest.create).not.toHaveBeenCalled();
  });

  it('reports enabled=false to the public config when unset', async () => {
    prismaMock.setting.findUnique.mockResolvedValue(null);
    const { svc } = makeService();
    await expect(svc.getConfig()).resolves.toEqual({ enabled: false });
  });

  it('stores a PENDING request with a hashed password and normalised e-mail', async () => {
    const { svc } = makeService();
    await expect(svc.submit(SUBMIT)).resolves.toEqual({ status: 'PENDING' });
    const data = prismaMock.accountRequest.create.mock.calls[0]![0].data;
    expect(data.email).toBe('visitor@example.com');
    expect(data.username).toBe('visitor');
    expect(data.passwordHash).toBe(`$2b$12$${SUBMIT.password.length}`);
    // The plaintext must never be persisted anywhere on the row.
    expect(JSON.stringify(data)).not.toContain(SUBMIT.password);
  });

  it('never mints a user or a token at submit time', async () => {
    const { svc } = makeService();
    const result = await svc.submit(SUBMIT);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('accessToken');
  });

  it('gives the same answer for an address that already has an account', async () => {
    // Anything else would be a user-enumeration oracle on a public endpoint.
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
    const { svc, security } = makeService();
    await expect(svc.submit(SUBMIT)).resolves.toEqual({ status: 'PENDING' });
    expect(prismaMock.accountRequest.create).not.toHaveBeenCalled();
    expect(security.emit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: 'existing_account' }) }),
    );
  });

  it('gives the same answer while a request is already pending', async () => {
    prismaMock.accountRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'PENDING' });
    const { svc } = makeService();
    await expect(svc.submit(SUBMIT)).resolves.toEqual({ status: 'PENDING' });
    expect(prismaMock.accountRequest.update).not.toHaveBeenCalled();
  });

  it('is indistinguishable across new, taken and queued addresses', async () => {
    const { svc } = makeService();
    const fresh = await svc.submit(SUBMIT);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
    const taken = await svc.submit(SUBMIT);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.accountRequest.findUnique.mockResolvedValue({ id: 'r', status: 'PENDING' });
    const queued = await svc.submit(SUBMIT);
    expect(fresh).toEqual(taken);
    expect(taken).toEqual(queued);
  });

  it('does not spend bcrypt on a request it is going to ignore', async () => {
    // bcrypt costs hundreds of ms on a single Node thread; hashing before the
    // cheap checks would turn a replay flood into CPU exhaustion.
    const { hashPassword } = await import('@asha/crypto');
    prismaMock.accountRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'PENDING' });
    const { svc } = makeService();
    await svc.submit(SUBMIT);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('stops recording once the pending queue is full', async () => {
    prismaMock.accountRequest.count.mockResolvedValue(500);
    const { svc, security } = makeService();
    await expect(svc.submit(SUBMIT)).resolves.toEqual({ status: 'PENDING' });
    expect(prismaMock.accountRequest.create).not.toHaveBeenCalled();
    expect(security.emit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: 'queue_full' }) }),
    );
  });

  it('revives a rejected request in place instead of inserting a duplicate', async () => {
    prismaMock.accountRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'REJECTED' });
    const { svc } = makeService();
    await svc.submit(SUBMIT);
    expect(prismaMock.accountRequest.create).not.toHaveBeenCalled();
    const data = prismaMock.accountRequest.update.mock.calls[0]![0].data;
    expect(data).toMatchObject({ status: 'PENDING', reviewedById: null, reviewedAt: null });
  });

  it('does not silently re-open an already approved address', async () => {
    prismaMock.accountRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'APPROVED' });
    const { svc } = makeService();
    await expect(svc.submit(SUBMIT)).resolves.toEqual({ status: 'PENDING' });
    expect(prismaMock.accountRequest.update).not.toHaveBeenCalled();
    expect(prismaMock.accountRequest.create).not.toHaveBeenCalled();
  });
});

describe('AccountRequestsService — approval', () => {
  const PENDING = {
    id: 'req1',
    email: 'visitor@example.com',
    username: 'visitor',
    displayName: null,
    passwordHash: 'hashed:pw',
    status: 'PENDING',
  };

  beforeEach(() => {
    prismaMock.accountRequest.findFirst.mockResolvedValue(PENDING);
    prismaMock.user.create.mockResolvedValue({ id: 'u-new', email: PENDING.email });
  });

  it('mints an ACTIVE user carrying the requester’s own password hash', async () => {
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    const data = prismaMock.user.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ orgId: 'org1', email: PENDING.email, status: 'ACTIVE', isSystemAdmin: false });
    expect(data.credentials.create).toMatchObject({ kind: 'PASSWORD', secret: 'hashed:pw' });
  });

  it('never grants system-admin through the public path', async () => {
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    expect(prismaMock.user.create.mock.calls[0]![0].data.isSystemAdmin).toBe(false);
  });

  it('applies a demo time limit when the admin sets one', async () => {
    const when = '2026-09-01T00:00:00.000Z';
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1', { deactivatesAt: when });
    expect(prismaMock.user.create.mock.calls[0]![0].data.deactivatesAt).toEqual(new Date(when));
  });

  it('leaves the account perpetual when no limit is given', async () => {
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    expect(prismaMock.user.create.mock.calls[0]![0].data).not.toHaveProperty('deactivatesAt');
  });

  it('creates the user and closes the request in one transaction', async () => {
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.accountRequest.updateMany.mock.calls[0]![0].data).toMatchObject({
      status: 'APPROVED',
      reviewedById: 'admin1',
    });
    expect(prismaMock.accountRequest.update.mock.calls[0]![0].data).toMatchObject({ createdUserId: 'u-new' });
  });

  it('claims the row conditionally on PENDING, so a racing reject cannot win', async () => {
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    expect(prismaMock.accountRequest.updateMany.mock.calls[0]![0].where).toMatchObject({
      id: 'req1',
      orgId: 'org1',
      status: 'PENDING',
    });
  });

  it('aborts the whole approval when the row was claimed by someone else', async () => {
    // The concurrent reviewer got there first: count 0 ⇒ throw ⇒ the $transaction
    // rolls back, so no orphan account survives.
    prismaMock.accountRequest.updateMany.mockResolvedValue({ count: 0 });
    const { svc } = makeService();
    await expect(svc.approve(ADMIN, 'req1')).rejects.toThrow(/already been reviewed/i);
  });

  it('refuses to approve twice', async () => {
    prismaMock.accountRequest.findFirst.mockResolvedValue({ ...PENDING, status: 'APPROVED' });
    const { svc } = makeService();
    await expect(svc.approve(ADMIN, 'req1')).rejects.toThrow(/already been reviewed/i);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('re-checks for an e-mail clash taken since the request was filed', async () => {
    // First call is the e-mail check in approve().
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u-existing' });
    const { svc } = makeService();
    await expect(svc.approve(ADMIN, 'req1')).rejects.toThrow(/already exists/i);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('suffixes a taken username instead of dead-ending the approval', async () => {
    // e-mail free → null; username 'visitor' taken → hit; 'visitor-2' free → null.
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'someone-else' })
      .mockResolvedValueOnce(null);
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    expect(prismaMock.user.create.mock.calls[0]![0].data.username).toBe('visitor-2');
  });

  it('honours an admin username override', async () => {
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1', { username: 'Custom.Name' });
    expect(prismaMock.user.create.mock.calls[0]![0].data.username).toBe('custom.name');
  });

  it('grants the demo workspaces so the account is not an empty catalogue', async () => {
    prismaMock.workspace.findMany.mockResolvedValue([{ id: 'ws-a' }, { id: 'ws-b' }]);
    const { svc } = makeService();
    await svc.approve(ADMIN, 'req1');
    expect(prismaMock.workspace.findMany.mock.calls[0]![0].where).toMatchObject({
      orgId: 'org1',
      isDemo: true,
      enabled: true,
    });
    expect(prismaMock.workspaceUser.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.workspaceUser.create.mock.calls[0]![0].data).toMatchObject({
      orgId: 'org1',
      workspaceId: 'ws-a',
      userId: 'u-new',
    });
  });

  it('404s on a request belonging to another tenant', async () => {
    prismaMock.accountRequest.findFirst.mockResolvedValue(null);
    const { svc } = makeService();
    await expect(svc.approve(ADMIN, 'req1')).rejects.toThrow(/not found/i);
    // The lookup must always be scoped by the acting admin's org.
    expect(prismaMock.accountRequest.findFirst.mock.calls[0]![0].where).toMatchObject({ orgId: 'org1' });
  });

  it('rejects an unknown groupId rather than silently falling back', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null);
    const { svc } = makeService();
    await expect(svc.approve(ADMIN, 'req1', { groupId: 'nope' })).rejects.toThrow(/group not found/i);
  });
});

describe('AccountRequestsService — rejection', () => {
  beforeEach(() => {
    prismaMock.accountRequest.findFirst.mockResolvedValue({
      id: 'req1',
      email: 'visitor@example.com',
      username: 'visitor',
      displayName: null,
      passwordHash: 'hashed:pw',
      status: 'PENDING',
    });
  });

  it('marks REJECTED and destroys the stored credential', async () => {
    const { svc } = makeService();
    await svc.reject(ADMIN, 'req1', 'not a customer');
    const call = prismaMock.accountRequest.updateMany.mock.calls[0]![0];
    expect(call.where).toMatchObject({ id: 'req1', orgId: 'org1', status: 'PENDING' });
    expect(call.data).toMatchObject({
      status: 'REJECTED',
      reviewedById: 'admin1',
      reviewNote: 'not a customer',
      passwordHash: '',
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('loses cleanly when a reject races an approval', async () => {
    prismaMock.accountRequest.updateMany.mockResolvedValue({ count: 0 });
    const { svc } = makeService();
    await expect(svc.reject(ADMIN, 'req1')).rejects.toThrow(/already been reviewed/i);
  });

  it('scopes the list query to the caller’s org', async () => {
    prismaMock.accountRequest.findMany.mockResolvedValue([]);
    const { svc } = makeService();
    await svc.list(ADMIN, 'pending');
    expect(prismaMock.accountRequest.findMany.mock.calls[0]![0].where).toMatchObject({
      orgId: 'org1',
      status: 'PENDING',
    });
  });

  it('ignores an unknown status filter instead of returning nothing', async () => {
    prismaMock.accountRequest.findMany.mockResolvedValue([]);
    const { svc } = makeService();
    await svc.list(ADMIN, 'bogus');
    expect(prismaMock.accountRequest.findMany.mock.calls[0]![0].where).not.toHaveProperty('status');
  });
});
