import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit.service';
import { RbacService } from './rbac.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [JwtModule.register({ global: true })],
  providers: [RbacService, AuditService, RedisService],
  exports: [RbacService, AuditService, RedisService, JwtModule],
})
export class CommonModule {}
