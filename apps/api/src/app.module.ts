import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { EnvModule } from './common/env.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { TenantInterceptor } from './common/tenant.interceptor';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { StorageModule } from './modules/storage/storage.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      // Default: 200 requests per 60 s per IP — applied to all routes
      { name: 'global', ttl: 60_000, limit: 200 },
      // Tighter: 10 requests per 60 s — applied explicitly to auth endpoints
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
    EnvModule,
    CommonModule,
    AuthModule,
    WorkspacesModule,
    SessionsModule,
    AgentsModule,
    CatalogModule,
    HealthModule,
    StorageModule,
    SharingModule,
    RecordingsModule,
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
