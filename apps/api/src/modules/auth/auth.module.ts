import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { StepUpGuard } from './step-up.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, StepUpGuard],
  exports: [AuthService],
})
export class AuthModule {}
