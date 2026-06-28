import { Module } from '@nestjs/common';
import { ImageBuildsController } from './image-builds.controller';
import { ImageBuildsService } from './image-builds.service';

@Module({
  controllers: [ImageBuildsController],
  providers: [ImageBuildsService],
})
export class ImageBuildsModule {}
