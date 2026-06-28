import { Module } from '@nestjs/common';
import { ExperimentalFeaturesController } from './experimental-features.controller';
import { ExperimentalFeaturesService } from './experimental-features.service';
import { FeatureGuard } from './feature.guard';

@Module({
  controllers: [ExperimentalFeaturesController],
  providers: [ExperimentalFeaturesService, FeatureGuard],
  exports: [ExperimentalFeaturesService],
})
export class ExperimentalFeaturesModule {}
