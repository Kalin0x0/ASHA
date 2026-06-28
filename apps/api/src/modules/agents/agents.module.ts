import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [SessionsModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
