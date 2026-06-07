import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { EnvModule } from './common/env.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { TenantInterceptor } from './common/tenant.interceptor';
import { AgentsModule } from './modules/agents/agents.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthProvidersModule } from './modules/auth-providers/auth-providers.module';
import { BackupsModule } from './modules/backups/backups.module';
import { CastingModule } from './modules/casting/casting.module';
import { ConnectivityModule } from './modules/connectivity/connectivity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { LogForwardingModule } from './modules/log-forwarding/log-forwarding.module';
import { RegistryModule } from './modules/registry/registry.module';
import { ScimModule } from './modules/scim/scim.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PoolsModule } from './modules/pools/pools.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { RegistrationTokensModule } from './modules/registration-tokens/registration-tokens.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { ServersModule } from './modules/servers/servers.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { StagingModule } from './modules/staging/staging.module';
import { StorageModule } from './modules/storage/storage.module';
import { WatermarksModule } from './modules/watermarks/watermarks.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WindowsModule } from './modules/windows/windows.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ZonesModule } from './modules/zones/zones.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      // Default: 200 requests per 60 s per IP — applied to all routes
      { name: 'global', ttl: 60_000, limit: 200 },
      // Tighter: 10 requests per 60 s — applied explicitly to auth endpoints
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
    // Drives the session reaper + scheduled DB backups
    ScheduleModule.forRoot(),
    EnvModule,
    CommonModule,
    AuthModule,
    WorkspacesModule,
    SessionsModule,
    AgentsModule,
    RegistrationTokensModule,
    CatalogModule,
    HealthModule,
    StorageModule,
    SharingModule,
    RecordingsModule,
    AuthProvidersModule,
    ZonesModule,
    StagingModule,
    CastingModule,
    ServersModule,
    PoolsModule,
    ProvidersModule,
    WebhooksModule,
    ReportingModule,
    ConnectivityModule,
    WindowsModule,
    WatermarksModule,
    LogForwardingModule,
    BackupsModule,
    LicensingModule,
    RegistryModule,
    ScimModule,
    ApiKeysModule,
    SettingsModule,
  ],
  providers: [
    // ThrottlerGuard runs first so rate-limit rejections short-circuit auth
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
