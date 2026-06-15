import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateAuthConfigDto,
  createAuthConfigSchema,
  type CreateSsoMappingDto,
  createSsoMappingSchema,
  type UpdateAuthConfigDto,
  updateAuthConfigSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { z } from 'zod';
import { AuthProvidersService } from './auth-providers.service';
import { LdapService } from './ldap.service';

const ldapTestSchema = z.object({ sampleUsername: z.string().max(120).optional() });
const ldapSyncSchema = z.object({
  dryRun: z.boolean().optional(),
  filter: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

@ApiTags('auth-providers')
@ApiBearerAuth()
@Controller('auth/providers')
export class AuthProvidersController {
  constructor(
    private readonly providers: AuthProvidersService,
    private readonly ldap: LdapService,
  ) {}

  /**
   * Public listing for the login screen — enabled OIDC/SAML/LDAP providers only,
   * no secrets. Reached pre-auth, so it resolves the default org when none given.
   */
  @Public()
  @Get('public')
  publicList() {
    return this.providers.publicList();
  }

  @RequirePermissions('AUTH_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.providers.list(user.orgId);
  }

  @RequirePermissions('AUTH_MANAGE')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.providers.get(user.orgId, id);
  }

  @RequirePermissions('AUTH_MANAGE')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createAuthConfigSchema)) dto: CreateAuthConfigDto,
  ) {
    return this.providers.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('AUTH_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateAuthConfigSchema)) dto: UpdateAuthConfigDto,
  ) {
    return this.providers.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('AUTH_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.providers.remove(user.orgId, user.sub, id);
  }

  // ── LDAP / AD directory (C3) ──────────────────────────────────────────────

  /** Live bind diagnostic (+ optional sample-user lookup). */
  @RequirePermissions('AUTH_MANAGE')
  @Post(':id/ldap/test')
  ldapTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ldapTestSchema)) dto: { sampleUsername?: string },
  ) {
    return this.ldap.test(user.orgId, id, dto.sampleUsername);
  }

  /** Bulk directory sync — provision/update Chista users from the directory. */
  @RequirePermissions('AUTH_MANAGE')
  @Post(':id/ldap/sync')
  ldapSync(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ldapSyncSchema)) dto: { dryRun?: boolean; filter?: string; limit?: number },
  ) {
    return this.ldap.sync(user.orgId, id, dto);
  }

  // ── SSO group mappings ────────────────────────────────────────────────────

  @RequirePermissions('AUTH_MANAGE')
  @Get(':id/mappings')
  listMappings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.providers.listMappings(user.orgId, id);
  }

  @RequirePermissions('AUTH_MANAGE')
  @Post('mappings')
  createMapping(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createSsoMappingSchema)) dto: CreateSsoMappingDto,
  ) {
    return this.providers.createMapping(user.orgId, user.sub, dto);
  }

  @RequirePermissions('AUTH_MANAGE')
  @Delete('mappings/:mappingId')
  removeMapping(@CurrentUser() user: AuthUser, @Param('mappingId') mappingId: string) {
    return this.providers.removeMapping(user.orgId, user.sub, mappingId);
  }
}
