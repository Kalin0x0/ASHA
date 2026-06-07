import { Module } from '@nestjs/common';
import { RegistrationTokensController } from './registration-tokens.controller';
import { RegistrationTokensService } from './registration-tokens.service';

@Module({
  controllers: [RegistrationTokensController],
  providers: [RegistrationTokensService],
  exports: [RegistrationTokensService],
})
export class RegistrationTokensModule {}
