import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit.service';
import { RbacService } from './rbac.service';
import { RedisService } from './redis.service';
import { SecurityEventService } from './security-event.service';

@Global()
@Module({
  imports: [JwtModule.register({ global: true })],
  providers: [RbacService, AuditService, RedisService, SecurityEventService],
  exports: [RbacService, AuditService, RedisService, SecurityEventService, JwtModule],
})
export class CommonModule {}
