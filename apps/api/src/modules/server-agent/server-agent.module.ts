import { Module } from '@nestjs/common';
import { RegistrationTokensModule } from '../registration-tokens/registration-tokens.module';
import { ServerAgentController } from './server-agent.controller';
import { ServerAgentService } from './server-agent.service';

@Module({
  imports: [RegistrationTokensModule],
  controllers: [ServerAgentController],
  providers: [ServerAgentService],
})
export class ServerAgentModule {}
