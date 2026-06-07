import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '@chista/crypto';
import { prisma } from '@chista/db';
import type { AuthUser } from '../../common/decorators';

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
}

export interface UpdateUserInput {
  username?: string;
  displayName?: string | null;
  locale?: string;
  isSystemAdmin?: boolean;
  status?: 'ACTIVE' | 'DISABLED' | 'INVITED' | 'LOCKED';
  password?: string;
}

@Injectable()
export class UsersService {
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
      select: SAFE_SELECT,
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
        ...(dto.password
          ? { credentials: { create: { kind: 'PASSWORD', secret: await hashPassword(dto.password) } } }
          : {}),
      },
      select: SAFE_SELECT,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateUserInput) {
    const target = await prisma.user.findFirst({ where: { id, orgId: user.orgId } });
    if (!target) throw new NotFoundException('User not found');

    // Never let the last active system admin be demoted or disabled — locks-out guard.
    if ((dto.isSystemAdmin === false || dto.status === 'DISABLED') && target.isSystemAdmin) {
      await this.assertNotLastAdmin(user.orgId);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(dto.username !== undefined ? { username: dto.username.toLowerCase() } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.isSystemAdmin !== undefined ? { isSystemAdmin: dto.isSystemAdmin } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
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

    try {
      await prisma.user.delete({ where: { id } });
    } catch {
      throw new BadRequestException(
        'User has dependent records (e.g. active sessions); disable the account instead',
      );
    }
    return { ok: true };
  }

  private async assertNotLastAdmin(orgId: string) {
    const admins = await prisma.user.count({ where: { orgId, isSystemAdmin: true, status: 'ACTIVE' } });
    if (admins <= 1) throw new BadRequestException('Cannot remove the last active system admin');
  }
}
