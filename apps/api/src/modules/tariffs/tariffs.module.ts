import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';

@Module({
  controllers: [TariffsController],
  providers: [TariffsService, AuditService],
  exports: [TariffsService],
})
export class TariffsModule {}
