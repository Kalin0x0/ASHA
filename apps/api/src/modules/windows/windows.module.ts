import { Module } from '@nestjs/common';
import { WindowsController } from './windows.controller';
import { WindowsService } from './windows.service';

@Module({
  controllers: [WindowsController],
  providers: [WindowsService],
})
export class WindowsModule {}
