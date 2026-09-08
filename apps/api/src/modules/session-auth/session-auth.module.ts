import { Module } from '@nestjs/common';
import { ObserveGrantService } from './observe-grant.service';
import { SessionAuthController } from './session-auth.controller';

/** JwtModule, ENV and RedisService are all registered globally in CommonModule. */
@Module({
  controllers: [SessionAuthController],
  providers: [ObserveGrantService],
})
export class SessionAuthModule {}
