import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';

@Module({
  controllers: [PolicyController],
  providers: [PolicyService],
})
export class PolicyModule {}
