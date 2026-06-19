import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashToken, randomToken } from '@asha/crypto';
import { prisma } from '@asha/db';

/**
 * Coerce a SCIM `active` value to a boolean. SCIM clients are inconsistent:
 * Azure AD sends the JSON string "True"/"False" in PATCH bodies, while Okta
 * sends a real boolean. Treat anything that isn't an explicit false/"false"/0
 * as active so a stringified "True" never disables a live user.
 */
function scimActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() !== 'false';
  if (typeof value === 'number') return value !== 0;
  return true;
}

/**
 * SCIM 2.0 provisioning service (RFC 7643 / RFC 7644).
 * Supports automated user and group lifecycle from enterprise IAM systems
 * (Okta, Azure AD, OneLogin, …).
 *
 * Authentication: Bearer token stored as a hashed ApiKey with scope 'SCIM'.
 * Admins generate tokens via POST /scim/v2/tokens; the value is shown once
 * and only the SHA-256 hash is persisted.
 */
@Injectable()
export class ScimService {
  // ── Token auth ──────────────────────────────────────────────────────────────

  async validateBearerToken(orgId: string, raw: string): Promise<void> {
    const hashed = hashToken(raw);
    const key = await prisma.apiKey.findFirst({
      where: {
        orgId,
        hashedKey: hashed,
        scopes: { has: 'SCIM' },
        revokedAt: null,
      },
    });
    if (!key) throw new UnauthorizedException('Invalid SCIM bearer token');
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('SCIM bearer token has expired');
    }
  }

  async issueToken(orgId: string, actorUserId: string): Promise<{ token: string; id: string }> {
    const raw = randomToken(32);
    const hashed = hashToken(raw);
    // prefix is shown in listing for identification (first 8 hex chars)
    const prefix = raw.slice(0, 8);
    const created = await prisma.apiKey.create({
      data: {
        orgId,
        userId: actorUserId,
        name: `SCIM provisioning token`,
        prefix,
        hashedKey: hashed,
        scopes: ['SCIM'],
      },
    });
    return { token: raw, id: created.id };
  }

  async revokeToken(orgId: string, id: string): Promise<void> {
    await prisma.apiKey.updateMany({ where: { id, orgId }, data: { revokedAt: new Date() } });
  }

  // ── SCIM Users ──────────────────────────────────────────────────────────────

  async listUsers(orgId: string, startIndex = 1, count = 100, filter?: string) {
    const skip = Math.max(0, startIndex - 1);
    const where = buildUserFilter(orgId, filter);
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, skip, take: count, orderBy: { createdAt: 'asc' } }),
      prisma.user.count({ where }),
    ]);
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u) => userToScim(u)),
    };
  }

  async getUser(orgId: string, id: string) {
    const u = await prisma.user.findFirst({ where: { id, orgId } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    return userToScim(u);
  }

  async createUser(orgId: string, body: ScimUserBody) {
    const email = body.emails?.[0]?.value ?? body.userName;
    if (!email) throw new BadRequestException('userName or emails required');
    const existing = await prisma.user.findFirst({ where: { orgId, email: email.toLowerCase() } });
    if (existing) {
      // SCIM spec: POST is idempotent for unique constraints → return existing.
      return userToScim(existing);
    }
    const u = await prisma.user.create({
      data: {
        orgId,
        email: email.toLowerCase(),
        username: body.userName ?? email.toLowerCase(),
        displayName: body.displayName ?? body.name?.formatted ?? null,
        externalId: body.externalId ?? null,
        status: scimActive(body.active) ? 'ACTIVE' : 'DISABLED',
      },
    });
    return userToScim(u);
  }

  async replaceUser(orgId: string, id: string, body: ScimUserBody) {
    const u = await prisma.user.findFirst({ where: { id, orgId } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    const updated = await prisma.user.update({
      where: { id },
      data: {
        username: body.userName ?? u.username,
        displayName: body.displayName ?? body.name?.formatted ?? u.displayName,
        externalId: body.externalId ?? u.externalId,
        status: scimActive(body.active) ? 'ACTIVE' : 'DISABLED',
      },
    });
    return userToScim(updated);
  }

  async patchUser(orgId: string, id: string, operations: ScimOperation[]) {
    const u = await prisma.user.findFirst({ where: { id, orgId } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    const data: Record<string, unknown> = {};
    for (const op of operations) {
      const lop = op.op.toLowerCase();
      if (lop === 'replace' || lop === 'add') {
        if (op.path === 'active') data['status'] = scimActive(op.value) ? 'ACTIVE' : 'DISABLED';
        if (op.path === 'userName') data['username'] = op.value;
        if (op.path === 'displayName') data['displayName'] = op.value;
        if (op.path === 'externalId') data['externalId'] = op.value;
        if (!op.path && typeof op.value === 'object' && op.value !== null) {
          const v = op.value as Record<string, unknown>;
          if ('active' in v) data['status'] = scimActive(v['active']) ? 'ACTIVE' : 'DISABLED';
          if ('userName' in v) data['username'] = v['userName'];
          if ('displayName' in v) data['displayName'] = v['displayName'];
          if ('externalId' in v) data['externalId'] = v['externalId'];
        }
      }
    }
    const updated = await prisma.user.update({ where: { id }, data });
    return userToScim(updated);
  }

  async deleteUser(orgId: string, id: string) {
    const u = await prisma.user.findFirst({ where: { id, orgId } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    // Soft-delete: deactivate so audit trail and session history are preserved.
    await prisma.user.update({ where: { id }, data: { status: 'DISABLED' } });
  }

  // ── SCIM Groups ─────────────────────────────────────────────────────────────

  async listGroups(orgId: string, startIndex = 1, count = 100, filter?: string) {
    const skip = Math.max(0, startIndex - 1);
    const where = buildGroupFilter(orgId, filter);
    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        where,
        skip,
        take: count,
        orderBy: { createdAt: 'asc' },
        include: { members: { include: { user: true } } },
      }),
      prisma.group.count({ where }),
    ]);
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex,
      itemsPerPage: groups.length,
      Resources: groups.map((g) => groupToScim(g)),
    };
  }

  async getGroup(orgId: string, id: string) {
    const g = await prisma.group.findFirst({
      where: { id, orgId },
      include: { members: { include: { user: true } } },
    });
    if (!g) throw new NotFoundException(`Group ${id} not found`);
    return groupToScim(g);
  }

  async createGroup(orgId: string, body: ScimGroupBody) {
    const existing = await prisma.group.findFirst({ where: { orgId, name: body.displayName } });
    if (existing) {
      const full = await prisma.group.findFirst({
        where: { id: existing.id },
        include: { members: { include: { user: true } } },
      });
      return groupToScim(full!);
    }
    const g = await prisma.group.create({ data: { orgId, name: body.displayName } });
    if (body.members?.length) {
      await syncGroupMembers(orgId, g.id, body.members);
    }
    const full = await prisma.group.findFirst({
      where: { id: g.id },
      include: { members: { include: { user: true } } },
    });
    return groupToScim(full!);
  }

  async replaceGroup(orgId: string, id: string, body: ScimGroupBody) {
    const g = await prisma.group.findFirst({ where: { id, orgId } });
    if (!g) throw new NotFoundException(`Group ${id} not found`);
    await prisma.group.update({ where: { id }, data: { name: body.displayName } });
    await prisma.userGroup.deleteMany({ where: { groupId: id } });
    if (body.members?.length) await syncGroupMembers(orgId, id, body.members);
    const full = await prisma.group.findFirst({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    return groupToScim(full!);
  }

  async patchGroup(orgId: string, id: string, operations: ScimOperation[]) {
    const g = await prisma.group.findFirst({ where: { id, orgId } });
    if (!g) throw new NotFoundException(`Group ${id} not found`);
    for (const op of operations) {
      const lop = op.op.toLowerCase();
      if (op.path === 'displayName' && lop === 'replace') {
        await prisma.group.update({ where: { id }, data: { name: String(op.value) } });
      } else if (op.path === 'members') {
        const members = (Array.isArray(op.value) ? op.value : []) as Array<{ value: string }>;
        if (lop === 'add') {
          await syncGroupMembers(orgId, id, members);
        } else if (lop === 'remove') {
          const ids = members.map((m) => m.value);
          await prisma.userGroup.deleteMany({ where: { groupId: id, userId: { in: ids } } });
        } else if (lop === 'replace') {
          await prisma.userGroup.deleteMany({ where: { groupId: id } });
          await syncGroupMembers(orgId, id, members);
        }
      }
    }
    const full = await prisma.group.findFirst({
      where: { id },
      include: { members: { include: { user: true } } },
    });
    return groupToScim(full!);
  }

  async deleteGroup(orgId: string, id: string) {
    const g = await prisma.group.findFirst({ where: { id, orgId } });
    if (!g) throw new NotFoundException(`Group ${id} not found`);
    await prisma.group.delete({ where: { id } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types and helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ScimOperation {
  op: string;
  path?: string;
  value?: unknown;
}

interface ScimUserBody {
  externalId?: string;
  userName?: string;
  displayName?: string;
  name?: { formatted?: string };
  emails?: Array<{ value: string; primary?: boolean }>;
  active?: boolean;
}

interface ScimGroupBody {
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userToScim(u: any) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: u.id,
    externalId: u.externalId ?? undefined,
    userName: u.username ?? u.email,
    displayName: u.displayName ?? undefined,
    emails: [{ value: u.email, primary: true }],
    active: u.status === 'ACTIVE',
    meta: {
      resourceType: 'User',
      created: u.createdAt,
      lastModified: u.updatedAt ?? u.createdAt,
      location: `/scim/v2/Users/${u.id}`,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupToScim(g: any) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: g.id,
    displayName: g.name,
    members: (g.members ?? []).map((m: any) => ({
      value: m.userId ?? m.user?.id,
      display: m.user?.displayName ?? m.user?.username ?? m.user?.email,
      $ref: `/scim/v2/Users/${m.userId ?? m.user?.id}`,
    })),
    meta: {
      resourceType: 'Group',
      created: g.createdAt,
      lastModified: g.updatedAt ?? g.createdAt,
      location: `/scim/v2/Groups/${g.id}`,
    },
  };
}

function buildUserFilter(orgId: string, filter?: string): object {
  const base = { orgId } as Record<string, unknown>;
  if (!filter) return base;
  // Support: userName eq "foo" and emails.value eq "bar"
  const emailMatch = /emails\.value\s+eq\s+"([^"]+)"/i.exec(filter);
  const userNameMatch = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
  if (emailMatch) base['email'] = emailMatch[1].toLowerCase();
  if (userNameMatch) base['username'] = userNameMatch[1];
  return base;
}

function buildGroupFilter(orgId: string, filter?: string): object {
  const base = { orgId } as Record<string, unknown>;
  if (!filter) return base;
  const displayNameMatch = /displayName\s+eq\s+"([^"]+)"/i.exec(filter);
  if (displayNameMatch) base['name'] = displayNameMatch[1];
  return base;
}

async function syncGroupMembers(
  orgId: string,
  groupId: string,
  members: Array<{ value: string }>,
) {
  for (const m of members) {
    const user = await prisma.user.findFirst({ where: { id: m.value, orgId } });
    if (!user) continue;
    await prisma.userGroup
      .create({ data: { orgId, groupId, userId: m.value } })
      .catch(() => undefined);
  }
}
