import { Module } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

@Module({
  controllers: [CopilotController],
  providers: [CopilotService],
})
export class CopilotModule {}
