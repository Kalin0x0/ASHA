import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type ConfirmTotpDto,
  confirmTotpSchema,
  type LoginDto,
  loginSchema,
  type RefreshDto,
  refreshSchema,
} from '@asha/contracts';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AuthService } from './auth.service';
import { StepUpGuard } from './step-up.guard';

const impersonateSchema = z.object({ userId: z.string().min(1) });
type ImpersonateDto = z.infer<typeof impersonateSchema>;

const stepUpSchema = z.object({ totp: z.string().min(6).max(8) });
type StepUpDto = z.infer<typeof stepUpSchema>;

// login + refresh are the brute-force targets — tighten the default throttler
// to 10/min per IP on these routes (env-tunable via ASHA_THROTTLE_AUTH_LIMIT).
@Throttle({ default: { ttl: 60_000, limit: Number(process.env.ASHA_THROTTLE_AUTH_LIMIT) || 10 } })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodPipe(loginSchema)) dto: LoginDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.login(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() body: { refreshToken?: string }) {
    return this.auth.logout(user.sub, body?.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }

  @ApiBearerAuth()
  @Post('impersonate')
  impersonate(@CurrentUser() user: AuthUser, @Body(new ZodPipe(impersonateSchema)) dto: ImpersonateDto) {
    return this.auth.impersonate(user, dto.userId);
  }

  @ApiBearerAuth()
  @Post('step-up')
  stepUp(@CurrentUser() user: AuthUser, @Body(new ZodPipe(stepUpSchema)) dto: StepUpDto) {
    return this.auth.stepUp(user, dto.totp);
  }

  /** Demo route requiring step-up — proves StepUpGuard (apply to sensitive ops). */
  @ApiBearerAuth()
  @UseGuards(StepUpGuard)
  @Get('step-up/protected')
  stepUpProtected() {
    return { ok: true, acr: 'step-up' };
  }

  // ── TOTP / 2FA ──────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('2fa/totp/enroll')
  enrollTotp(@CurrentUser() user: AuthUser) {
    return this.auth.enrollTotp(user.sub);
  }

  @ApiBearerAuth()
  @Post('2fa/totp/confirm')
  confirmTotp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(confirmTotpSchema)) dto: ConfirmTotpDto,
  ) {
    return this.auth.confirmTotp(user.sub, dto);
  }

  @ApiBearerAuth()
  @Delete('2fa/totp')
  disableTotp(@CurrentUser() user: AuthUser) {
    return this.auth.disableTotp(user.sub);
  }
}
