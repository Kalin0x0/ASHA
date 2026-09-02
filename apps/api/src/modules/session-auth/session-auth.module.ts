import { Module } from '@nestjs/common';
import { SessionAuthController } from './session-auth.controller';

/** JwtModule and the ENV provider are registered globally in CommonModule. */
@Module({
  controllers: [SessionAuthController],
})
export class SessionAuthModule {}
