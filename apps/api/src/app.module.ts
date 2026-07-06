import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { EnvModule } from './common/env.module';
import { AuditInterceptor } from './common/audit.interceptor';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { TenantInterceptor } from './common/tenant.interceptor';
import { AgentsModule } from './modules/agents/agents.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthProvidersModule } from './modules/auth-providers/auth-providers.module';
import { DemoModule } from './modules/demo/demo.module';
import { BackupsModule } from './modules/backups/backups.module';
import { BugReportsModule } from './modules/bug-reports/bug-reports.module';
import { CastingModule } from './modules/casting/casting.module';
import { ConnectivityModule } from './modules/connectivity/connectivity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { TariffsModule } from './modules/tariffs/tariffs.module';
import { LogForwardingModule } from './modules/log-forwarding/log-forwarding.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { RegistryModule } from './modules/registry/registry.module';
import { ScimModule } from './modules/scim/scim.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PoolsModule } from './modules/pools/pools.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { RegistrationTokensModule } from './modules/registration-tokens/registration-tokens.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { GroupsModule } from './modules/groups/groups.module';
import { DevApiModule } from './modules/dev-api/dev-api.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { ServerAgentModule } from './modules/server-agent/server-agent.module';
import { ServersModule } from './modules/servers/servers.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { StagingModule } from './modules/staging/staging.module';
import { StorageModule } from './modules/storage/storage.module';
import { OrgConfigModule } from './modules/config/config.module';
import { PolicyModule } from './modules/policy/policy.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { ExperimentalFeaturesModule } from './modules/experimental-features/experimental-features.module';
import { ImageBuildsModule } from './modules/image-builds/image-builds.module';
import { WatermarksModule } from './modules/watermarks/watermarks.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WindowsModule } from './modules/windows/windows.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ZonesModule } from './modules/zones/zones.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      // ONE default throttler, applied to every route — a generous per-client cap
      // (keyed on the real client IP once the app trusts the proxy, see main.ts)
      // sized for an authenticated dashboard that polls sessions/agents. Auth
      // routes tighten it with a per-route `@Throttle({ default: … })` override
      // (auth / federation / webauthn controllers). A SECOND named throttler here
      // would also apply to every route — that was the bug that capped the whole
      // API at the auth limit (→ 429 on dashboard polling). Override via ASHA_THROTTLE_*.
      {
        name: 'default',
        ttl: Number(process.env.ASHA_THROTTLE_TTL) || 60_000,
        limit: Number(process.env.ASHA_THROTTLE_LIMIT) || 600,
      },
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
    UsersModule,
    RolesModule,
    GroupsModule,
    OrgConfigModule,
    PolicyModule,
    CopilotModule,
    ExperimentalFeaturesModule,
    ImageBuildsModule,
    DevApiModule,
    CatalogModule,
    HealthModule,
    StorageModule,
    SharingModule,
    RecordingsModule,
    AuthProvidersModule,
    FeedbackModule,
    ZonesModule,
    StagingModule,
    CastingModule,
    ServersModule,
    ServerAgentModule,
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
    TariffsModule,
    DemoModule,
    RegistryModule,
    ScimModule,
    ApiKeysModule,
    SettingsModule,
    BugReportsModule,
    MaintenanceModule,
  ],
  providers: [
    // ThrottlerGuard runs first so rate-limit rejections short-circuit auth
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    // Declarative auditing — records entries for handlers decorated with @Audit().
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
