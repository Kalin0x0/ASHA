import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { prisma } from '@asha/db';
import {
  type AuthUser,
  CurrentUser,
  Public,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators';

/**
 * Lightweight read endpoints backing pickers and the login screen.
 *
 * These paths overlap dedicated controllers, and Nest resolves an overlap by
 * registration order — whichever module AppModule imports first wins. `/users`
 * and `/groups` were duplicated here and never reached (their real controllers
 * are imported earlier); `/zones` and `/settings` were reached, so the copies
 * here shadowed the guarded originals and served zone and settings rows to any
 * authenticated caller. The duplicates are gone and what remains carries its own
 * guards, so behaviour no longer depends on import order.
 */
@ApiTags('catalog')
@Controller()
export class CatalogController {
  /**
   * Zone list used as a picker by the agents, servers, staging, autoscale and
   * workspace admin screens — hence any-of, rather than the ZONE_MANAGE that
   * only the zones screen itself carries. End users have no business reading a
   * zone's `proxyBaseUrl` or free-form settings, so plain WORKSPACE_VIEW (held
   * by every seeded user) is deliberately not in this list.
   */
  @ApiBearerAuth()
  @RequireAnyPermission(
    'ZONE_MANAGE',
    'AGENT_VIEW',
    'AGENT_MANAGE',
    'SERVER_MANAGE',
    'POOL_MANAGE',
    'AUTOSCALE_MANAGE',
    'IMAGE_MANAGE',
    'WORKSPACE_CREATE',
    'WORKSPACE_EDIT',
  )
  @Get('zones')
  zones() {
    return prisma.deploymentZone.findMany({ orderBy: { name: 'asc' } });
  }

  /** Org + deployment-wide settings. Reading these is an admin action. */
  @ApiBearerAuth()
  @RequirePermissions('SETTINGS_MANAGE')
  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return prisma.setting.findMany({
      where: { OR: [{ orgId: user.orgId }, { scope: 'GLOBAL' }] },
    });
  }

  /** Product name, colours and logo for the login screen — pre-authentication. */
  @Public()
  @Get('branding')
  async branding() {
    const branding = await prisma.branding.findFirst({ where: { scope: 'ORG' } });
    return (
      branding ?? {
        productName: 'Asha',
        primaryColor: '#1a1a2e',
        accentColor: '#d4af37',
        logoUrl: null,
      }
    );
  }
}
