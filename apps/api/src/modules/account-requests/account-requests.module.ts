import { Module } from '@nestjs/common';
import { AccountRequestsController } from './account-requests.controller';
import { AccountRequestsService } from './account-requests.service';

@Module({
  controllers: [AccountRequestsController],
  providers: [AccountRequestsService],
  exports: [AccountRequestsService],
})
export class AccountRequestsModule {}
