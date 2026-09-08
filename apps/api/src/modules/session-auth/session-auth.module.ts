import { Module } from '@nestjs/common';
import { SessionAuthController } from './session-auth.controller';

/** JwtModule and ENV are both registered globally in CommonModule. */
@Module({
  controllers: [SessionAuthController],
})
export class SessionAuthModule {}
