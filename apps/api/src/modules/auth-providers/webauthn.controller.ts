import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { type AuthUser, CurrentUser, Public } from '../../common/decorators';
import { AuthService } from '../auth/auth.service';
import { WebauthnService } from './webauthn.service';

interface ReqMeta {
  ip?: string;
  headers: Record<string, string>;
}

@ApiTags('auth-webauthn')
@Controller('auth/webauthn')
export class WebauthnController {
  constructor(
    private readonly webauthn: WebauthnService,
    private readonly auth: AuthService,
  ) {}

  // ── Registration (authenticated user adds a passkey) ────────────────────────

  @ApiBearerAuth()
  @Post('register/options')
  registerOptions(@CurrentUser() user: AuthUser) {
    return this.webauthn.registrationOptions(user.sub);
  }

  @ApiBearerAuth()
  @Post('register/verify')
  registerVerify(
    @CurrentUser() user: AuthUser,
    @Body() body: { response: RegistrationResponseJSON; deviceName?: string },
  ) {
    return this.webauthn.verifyRegistration(user.sub, body.response, body.deviceName);
  }

  @ApiBearerAuth()
  @Get('credentials')
  listCredentials(@CurrentUser() user: AuthUser) {
    return this.webauthn.listCredentials(user.sub);
  }

  @ApiBearerAuth()
  @Delete('credentials/:id')
  removeCredential(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webauthn.removeCredential(user.sub, id);
  }

  // ── Authentication (public passkey login) ───────────────────────────────────

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('login/options')
  loginOptions(@Body() body: { email: string }) {
    return this.webauthn.authenticationOptions(body.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('login/verify')
  async loginVerify(
    @Body() body: { email: string; response: AuthenticationResponseJSON },
    @Req() req: ReqMeta,
  ) {
    const user = await this.webauthn.verifyAuthentication(body.email, body.response);
    return this.auth.issueSession(user, 'webauthn', req.ip, req.headers['user-agent']);
  }
}
