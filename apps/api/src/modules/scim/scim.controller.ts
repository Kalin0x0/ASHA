import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public, RequirePermissions, CurrentUser, type AuthUser } from '../../common/decorators';
import { ScimService, type ScimOperation } from './scim.service';

interface ScimRequest {
  headers: { authorization?: string };
}

/**
 * SCIM 2.0 provisioning endpoints (RFC 7644).
 * All /scim/v2 routes are public (bypass JWT guard) and authenticated via
 * a SCIM Bearer token validated against the hashed SystemToken store.
 */
@ApiTags('scim')
@Controller('scim/v2')
export class ScimController {
  constructor(private readonly scim: ScimService) {}

  private async auth(orgId: string, req: ScimRequest): Promise<void> {
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ')) throw new UnauthorizedException('SCIM bearer token required');
    await this.scim.validateBearerToken(orgId, bearer.slice(7));
  }

  // ── Service-provider metadata ──────────────────────────────────────────────

  @Public()
  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authentication scheme using the OAuth Bearer Token Standard',
          specUri: 'http://www.rfc-editor.org/info/rfc6750',
          primary: true,
        },
      ],
    };
  }

  @Public()
  @Get('ResourceTypes')
  resourceTypes() {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/Users',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: '/Groups',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        },
      ],
    };
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Public()
  @Get(':orgId/Users')
  async listUsers(
    @Param('orgId') orgId: string,
    @Query('startIndex') startIndex: string | undefined,
    @Query('count') count: string | undefined,
    @Query('filter') filter: string | undefined,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.listUsers(orgId, Number(startIndex ?? 1), Number(count ?? 100), filter);
  }

  @Public()
  @Get(':orgId/Users/:id')
  async getUser(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: ScimRequest) {
    await this.auth(orgId, req);
    return this.scim.getUser(orgId, id);
  }

  @Public()
  @Post(':orgId/Users')
  @HttpCode(201)
  async createUser(
    @Param('orgId') orgId: string,
    @Body() body: unknown,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.createUser(orgId, body as Parameters<ScimService['createUser']>[1]);
  }

  @Public()
  @Put(':orgId/Users/:id')
  async replaceUser(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.replaceUser(orgId, id, body as Parameters<ScimService['replaceUser']>[2]);
  }

  @Public()
  @Patch(':orgId/Users/:id')
  async patchUser(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { Operations?: ScimOperation[] },
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.patchUser(orgId, id, body.Operations ?? []);
  }

  @Public()
  @Delete(':orgId/Users/:id')
  @HttpCode(204)
  async deleteUser(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    await this.scim.deleteUser(orgId, id);
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  @Public()
  @Get(':orgId/Groups')
  async listGroups(
    @Param('orgId') orgId: string,
    @Query('startIndex') startIndex: string | undefined,
    @Query('count') count: string | undefined,
    @Query('filter') filter: string | undefined,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.listGroups(orgId, Number(startIndex ?? 1), Number(count ?? 100), filter);
  }

  @Public()
  @Get(':orgId/Groups/:id')
  async getGroup(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: ScimRequest) {
    await this.auth(orgId, req);
    return this.scim.getGroup(orgId, id);
  }

  @Public()
  @Post(':orgId/Groups')
  @HttpCode(201)
  async createGroup(
    @Param('orgId') orgId: string,
    @Body() body: unknown,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.createGroup(orgId, body as Parameters<ScimService['createGroup']>[1]);
  }

  @Public()
  @Put(':orgId/Groups/:id')
  async replaceGroup(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.replaceGroup(orgId, id, body as Parameters<ScimService['replaceGroup']>[2]);
  }

  @Public()
  @Patch(':orgId/Groups/:id')
  async patchGroup(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { Operations?: ScimOperation[] },
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    return this.scim.patchGroup(orgId, id, body.Operations ?? []);
  }

  @Public()
  @Delete(':orgId/Groups/:id')
  @HttpCode(204)
  async deleteGroup(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: ScimRequest,
  ) {
    await this.auth(orgId, req);
    await this.scim.deleteGroup(orgId, id);
  }

  // ── Token management (admin-only, requires JWT) ────────────────────────────

  @RequirePermissions('ORG_MANAGE')
  @Post('tokens')
  issueToken(@CurrentUser() user: AuthUser) {
    return this.scim.issueToken(user.orgId, user.sub);
  }

  @RequirePermissions('ORG_MANAGE')
  @Delete('tokens/:id')
  @HttpCode(204)
  revokeToken(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scim.revokeToken(user.orgId, id);
  }
}
