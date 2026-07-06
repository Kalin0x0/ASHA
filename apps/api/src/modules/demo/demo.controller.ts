import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { DemoService } from './demo.service';

const startDemoSchema = z.object({
  email: z.string().email(),
  fingerprint: z.string().min(1).max(512),
});
type StartDemoDto = z.infer<typeof startDemoSchema>;

/** Public 10-minute demo. Throttled hard (3/min per IP) — it mints real accounts. */
@Throttle({ default: { ttl: 60_000, limit: Number(process.env.ASHA_THROTTLE_DEMO_LIMIT) || 3 } })
@ApiTags('auth')
@Controller('auth')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Get('demo')
  config() {
    return this.demo.getConfig();
  }

  @Public()
  @Post('demo')
  start(@Body(new ZodPipe(startDemoSchema)) dto: StartDemoDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) || req.ip;
    return this.demo.startDemo({ email: dto.email, fingerprint: dto.fingerprint, ip, userAgent: req.headers['user-agent'] });
  }
}
