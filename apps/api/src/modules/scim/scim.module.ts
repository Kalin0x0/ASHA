import { Module } from '@nestjs/common';
import { ScimController } from './scim.controller';
import { ScimService } from './scim.service';

@Module({
  controllers: [ScimController],
  providers: [ScimService],
  exports: [ScimService],
})
export class ScimModule {}
