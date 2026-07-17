import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '@asha/crypto';
import { prisma } from '@asha/db';
import type { AuthUser } from '../../common/decorators';
import { SessionsService } from '../sessions/sessions.service';

/** Columns safe to return to the admin UI — never credentials/secrets. */
const SAFE_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  isSystemAdmin: true,
  locale: true,
  lastLoginAt: true,
  deactivatesAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CreateUserInput {
  email: string;
  username?: string;
  displayName?: string;
  password?: string;
  isSystemAdmin?: boolean;
  locale?: string;
  deactivatesAt?: string | null;
}

export interface UpdateUserInput {
  username?: string;
  displayName?: string | null;
  locale?: string;
  isSystemAdmin?: boolean;
  status?: 'ACTIVE' | 'DISABLED' | 'INVITED' | 'LOCKED';
  password?: string;
  deactivatesAt?: string | null;
}

/** Minimal RFC-4180-ish CSV line parser (handles "quoted, fields" + "" escapes). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse a CSV (header row + data rows) into lowercased-keyed records. */
function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

@Injectable()
export class UsersService {
  constructor(private readonly sessions: SessionsService) {}

  async list(user: AuthUser, q?: string) {
    return prisma.user.findMany({
      where: {
        orgId: user.orgId,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { username: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        ...SAFE_SELECT,
        groups: {
          select: {
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async get(user: AuthUser, id: string) {
    const u = await prisma.user.findFirst({ where: { id, orgId: user.orgId }, select: SAFE_SELECT });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async create(user: AuthUser, dto: CreateUserInput) {
    // Only a system admin may mint another system admin (isSystemAdmin bypasses RBAC).
    if (dto.isSystemAdmin && !user.isSystemAdmin) {
      throw new ForbiddenException('Only a system admin can grant system-admin');
    }
    const email = dto.email.toLowerCase();
    const username = (dto.username ?? email).toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { orgId: user.orgId, OR: [{ email }, { username }] },
    });
    if (existing) throw new ConflictException('A user with this email or username already exists');

    return prisma.user.create({
      data: {
        orgId: user.orgId,
        email,
        username,
        displayName: dto.displayName ?? null,
        isSystemAdmin: dto.isSystemAdmin ?? false,
        locale: dto.locale ?? 'en',
        status: 'ACTIVE',
        ...(dto.deactivatesAt ? { deactivatesAt: new Date(dto.deactivatesAt) } : {}),
        ...(dto.password
          ? { credentials: { create: { kind: 'PASSWORD', secret: await hashPassword(dto.password) } } }
          : {}),
      },
      select: SAFE_SELECT,
    });
  }

  /**
   * Bulk-create users from a CSV (header row). Recognised columns:
   * `email` (required), `username`, `displayName`, `password`, `isSystemAdmin`
   * (1/true/yes), `locale`, `groups` (semicolon-separated group names).
   * Existing users are skipped (not overwritten); per-row errors are collected
   * so one bad row never aborts the batch.
   */
  async bulkImport(user: AuthUser, csv: string) {
    const rows = parseCsv(csv);
    const result = {
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; email: string; error: string }>,
    };
    const groupCache = new Map<string, string | null>();

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const rowNo = i + 2; // 1-based + header row
      const email = (r.email ?? '').trim();
      if (!email) {
        result.errors.push({ row: rowNo, email: '', error: 'missing email' });
        continue;
      }
      try {
        const isAdmin = ['1', 'true', 'yes'].includes((r.issystemadmin ?? '').toLowerCase());
        const created = await this.create(user, {
          email,
          username: r.username || undefined,
          displayName: r.displayname || undefined,
          password: r.password || undefined,
          isSystemAdmin: isAdmin,
          locale: r.locale || undefined,
        });
        const groupNames = (r.groups ?? '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const name of groupNames) {
          const key = name.toLowerCase();
          let gid = groupCache.get(key);
          if (gid === undefined) {
            const g = await prisma.group.findFirst({ where: { name } });
            gid = g?.id ?? null;
            groupCache.set(key, gid);
          }
          if (!gid) {
            result.errors.push({ row: rowNo, email, error: `unknown group "${name}"` });
            continue;
          }
          const existing = await prisma.userGroup.findFirst({ where: { userId: created.id, groupId: gid } });
          if (!existing) {
            await prisma.userGroup.create({ data: { orgId: user.orgId, userId: created.id, groupId: gid } });
          }
        }
        result.created += 1;
      } catch (e) {
        if (e instanceof ConflictException) {
          result.skipped += 1;
          result.errors.push({ row: rowNo, email, error: 'already exists' });
        } else if (e instanceof ForbiddenException) {
          result.errors.push({ row: rowNo, email, error: 'system-admin column requires a system-admin importer' });
        } else {
          result.errors.push({ row: rowNo, email, error: (e as Error).message });
        }
      }
    }
    return result;
  }

  async update(user: AuthUser, id: string, dto: UpdateUserInput) {
    // Granting/revoking system-admin is itself a system-admin-only action.
    if (dto.isSystemAdmin !== undefined && !user.isSystemAdmin) {
      throw new ForbiddenException('Only a system admin can change system-admin status');
    }
    // A non-system-admin (even with USER_EDIT) must not edit their OWN account
    // status or license expiry — otherwise a license customer with edit rights
    // could reactivate themselves or clear their own expiry. Admins are exempt.
    if (
      !user.isSystemAdmin &&
      id === user.sub &&
      (dto.status !== undefined || dto.deactivatesAt !== undefined)
    ) {
      throw new ForbiddenException('You cannot change your own account status or license.');
    }
    const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId } });
    if (!target) throw new NotFoundException('User not found');

    // Never let the LAST active system admin lose admin OR leave ACTIVE
    // (covers DISABLED / LOCKED / INVITED) — lockout guard.
    const losingAdmin = dto.isSystemAdmin === false;
    const leavingActive = dto.status !== undefined && dto.status !== 'ACTIVE';
    if (target.isSystemAdmin && target.status === 'ACTIVE' && (losingAdmin || leavingActive)) {
      await this.assertNotLastAdmin(user.orgId);
    }

    if (dto.username !== undefined) {
      const clash = await prisma.user.findFirst({
        where: { orgId: user.orgId, username: dto.username.toLowerCase(), NOT: { id } },
      });
      if (clash) throw new ConflictException('Username is already in use');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(dto.username !== undefined ? { username: dto.username.toLowerCase() } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.isSystemAdmin !== undefined ? { isSystemAdmin: dto.isSystemAdmin } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        // Set/extend (renew) or clear (null → perpetual) the license expiry.
        ...(dto.deactivatesAt !== undefined
          ? { deactivatesAt: dto.deactivatesAt ? new Date(dto.deactivatesAt) : null }
          : {}),
      },
      select: SAFE_SELECT,
    });

    if (dto.password) {
      const secret = await hashPassword(dto.password);
      const cred = await prisma.userCredential.findFirst({ where: { userId: id, kind: 'PASSWORD' } });
      if (cred) await prisma.userCredential.update({ where: { id: cred.id }, data: { secret } });
      else await prisma.userCredential.create({ data: { userId: id, kind: 'PASSWORD', secret } });
    }
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    if (id === user.sub) throw new BadRequestException('You cannot delete your own account');
    const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.isSystemAdmin) await this.assertNotLastAdmin(user.orgId);

    // Drain before delete: Session.user is onDelete: Cascade, so deleting the
    // user hard-removes their session rows and leaves any running containers
    // orphaned with nothing to tear them down. Tear each live session down
    // first (same as workspace deletion + the demo reaper).
    const live = await prisma.session.findMany({
      where: { userId: id, status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] } },
      select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
    });
    for (const s of live) {
      await this.sessions.destroy(s, 'user_deleted');
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch {
      throw new BadRequestException(
        'User has dependent records; disable the account instead',
      );
    }
    return { ok: true };
  }

  private async assertNotLastAdmin(orgId: string) {
    const admins = await prisma.user.count({ where: { orgId, isSystemAdmin: true, status: 'ACTIVE' } });
    if (admins <= 1) throw new BadRequestException('Cannot remove the last active system admin');
  }
}
