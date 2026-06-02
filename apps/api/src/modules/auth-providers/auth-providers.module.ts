import { Module } from '@nestjs/common';
import { AuthProvidersController } from './auth-providers.controller';
import { AuthProvidersService } from './auth-providers.service';

@Module({
  controllers: [AuthProvidersController],
  providers: [AuthProvidersService],
})
export class AuthProvidersModule {}
