import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type ConfirmTotpDto,
  confirmTotpSchema,
  type LoginDto,
  loginSchema,
  type RefreshDto,
  refreshSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AuthService } from './auth.service';

// login + refresh are the brute-force targets — cap at 10/min per IP
@Throttle({ auth: { ttl: 60_000, limit: 10 } })
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
