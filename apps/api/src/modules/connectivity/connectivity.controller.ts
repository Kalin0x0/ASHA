import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateBrowserIsolationDto,
  createBrowserIsolationSchema,
  type CreateConnectionProxyDto,
  createConnectionProxySchema,
  type CreateEgressGatewayDto,
  createEgressGatewaySchema,
  type CreateWebFilterDto,
  createWebFilterSchema,
  type UpdateBrowserIsolationDto,
  updateBrowserIsolationSchema,
  type UpdateConnectionProxyDto,
  updateConnectionProxySchema,
  type UpdateEgressGatewayDto,
  updateEgressGatewaySchema,
  type UpdateWebFilterDto,
  updateWebFilterSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ConnectivityRenderService } from './connectivity-render.service';
import { ConnectivityService } from './connectivity.service';

@ApiTags('connectivity')
@ApiBearerAuth()
@Controller('connectivity')
export class ConnectivityController {
  constructor(
    private readonly svc: ConnectivityService,
    private readonly render: ConnectivityRenderService,
  ) {}

  // ── Connection proxies ───────────────────────────────────────────────────

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('proxies')
  listProxies(@CurrentUser() user: AuthUser) {
    return this.svc.listProxies(user.orgId);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Post('proxies')
  createProxy(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createConnectionProxySchema)) dto: CreateConnectionProxyDto,
  ) {
    return this.svc.createProxy(user.orgId, user.sub, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Patch('proxies/:id')
  updateProxy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateConnectionProxySchema)) dto: UpdateConnectionProxyDto,
  ) {
    return this.svc.updateProxy(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Delete('proxies/:id')
  removeProxy(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeProxy(user.orgId, user.sub, id);
  }

  // ── Egress gateways ──────────────────────────────────────────────────────

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('egress')
  listEgress(@CurrentUser() user: AuthUser) {
    return this.svc.listEgress(user.orgId);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Post('egress')
  createEgress(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createEgressGatewaySchema)) dto: CreateEgressGatewayDto,
  ) {
    return this.svc.createEgress(user.orgId, user.sub, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Patch('egress/:id')
  updateEgress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateEgressGatewaySchema)) dto: UpdateEgressGatewayDto,
  ) {
    return this.svc.updateEgress(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Delete('egress/:id')
  removeEgress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeEgress(user.orgId, user.sub, id);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('egress/:id/wireguard-config')
  renderWireGuard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.render.renderWireGuardConfig(user.orgId, id);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('egress/:id/openvpn-config')
  renderOpenVpn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.render.renderOpenVpnConfig(user.orgId, id);
  }

  // ── Web filters ──────────────────────────────────────────────────────────

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('filters')
  listFilters(@CurrentUser() user: AuthUser) {
    return this.svc.listFilters(user.orgId);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Post('filters')
  createFilter(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWebFilterSchema)) dto: CreateWebFilterDto,
  ) {
    return this.svc.createFilter(user.orgId, user.sub, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Patch('filters/:id')
  updateFilter(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateWebFilterSchema)) dto: UpdateWebFilterDto,
  ) {
    return this.svc.updateFilter(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Delete('filters/:id')
  removeFilter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeFilter(user.orgId, user.sub, id);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('filters/:id/squid-config')
  renderSquid(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.render.renderSquidConfig(user.orgId, id);
  }

  // ── Browser isolation ────────────────────────────────────────────────────

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('isolation')
  listIsolation(@CurrentUser() user: AuthUser) {
    return this.svc.listIsolation(user.orgId);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Post('isolation')
  createIsolation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createBrowserIsolationSchema)) dto: CreateBrowserIsolationDto,
  ) {
    return this.svc.createIsolation(user.orgId, user.sub, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Patch('isolation/:id')
  updateIsolation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateBrowserIsolationSchema)) dto: UpdateBrowserIsolationDto,
  ) {
    return this.svc.updateIsolation(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Delete('isolation/:id')
  removeIsolation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeIsolation(user.orgId, user.sub, id);
  }

  @RequirePermissions('CONNECTIVITY_MANAGE')
  @Get('isolation/:id/compose')
  renderIsolation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.render.renderIsolationCompose(user.orgId, id);
  }
}
