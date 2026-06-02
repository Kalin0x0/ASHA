import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { prisma } from '@chista/db';
import { Public } from '../../common/decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get('live')
  live() {
    return { status: 'ok', service: 'chista-api' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'up' };
    } catch {
      return { status: 'degraded', db: 'down' };
    }
  }
}
