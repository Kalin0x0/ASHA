import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { prisma } from '@chista/db';
import { type AuthUser, CurrentUser, Public } from '../../common/decorators';

/** Lightweight read endpoints for zones, users, settings and branding. */
@ApiTags('catalog')
@Controller()
export class CatalogController {
  @ApiBearerAuth()
  @Get('zones')
  zones() {
    return prisma.deploymentZone.findMany({ orderBy: { name: 'asc' } });
  }

  @ApiBearerAuth()
  @Get('users')
  users() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        status: true,
        isSystemAdmin: true,
        lastLoginAt: true,
        groups: { select: { group: { select: { name: true } } } },
      },
      orderBy: { email: 'asc' },
    });
  }

  @ApiBearerAuth()
  @Get('groups')
  groups(@CurrentUser() user: AuthUser) {
    return prisma.group.findMany({
      where: { orgId: user.orgId },
      select: {
        id: true,
        name: true,
        description: true,
        priority: true,
        isDefault: true,
        _count: { select: { members: true } },
      },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  @ApiBearerAuth()
  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return prisma.setting.findMany({
      where: { OR: [{ orgId: user.orgId }, { scope: 'GLOBAL' }] },
    });
  }

  @Public()
  @Get('branding')
  async branding() {
    const branding = await prisma.branding.findFirst({ where: { scope: 'ORG' } });
    return (
      branding ?? {
        productName: 'Chista',
        primaryColor: '#1a1a2e',
        accentColor: '#d4af37',
        logoUrl: null,
      }
    );
  }
}
