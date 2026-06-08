import { Module } from '@nestjs/common';
import { OrgConfigController } from './config.controller';
import { OrgConfigService } from './config.service';

@Module({
  controllers: [OrgConfigController],
  providers: [OrgConfigService],
})
export class OrgConfigModule {}
