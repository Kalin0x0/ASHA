import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AuthService } from '../auth/auth.service';
import { WebauthnService } from './webauthn.service';

interface ReqMeta {
  ip?: string;
  headers: Record<string, string>;
}

// The passkey ceremony payloads are opaque to us — @simplewebauthn does the
// cryptographic verification — but the ENVELOPE still has to be checked before
// it reaches a service. Two of these routes are @Public(), so without a schema
// a missing/!string `email` reached `authenticationOptions` as undefined and
// turned a malformed request into an unhandled 500.
// The WebAuthn credential envelope, as the browser's `navigator.credentials`
// serializes it. Inner `response` fields stay open — @simplewebauthn owns their
// meaning — but the outer shape is pinned so a malformed body is a clean 400
// instead of an unhandled 500 deep inside the verifier.
const credentialSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.string().min(1),
    response: z.record(z.unknown()),
    clientExtensionResults: z.record(z.unknown()),
    authenticatorAttachment: z.string().optional(),
  })
  .passthrough();

const registerVerifySchema = z.object({
  response: credentialSchema,
  deviceName: z.string().max(120).optional(),
});
type RegisterVerifyDto = z.infer<typeof registerVerifySchema>;

const loginOptionsSchema = z.object({ email: z.string().min(1).max(320) });
type LoginOptionsDto = z.infer<typeof loginOptionsSchema>;

const loginVerifySchema = z.object({
  email: z.string().min(1).max(320),
  response: credentialSchema,
});
type LoginVerifyDto = z.infer<typeof loginVerifySchema>;

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
    @Body(new ZodPipe(registerVerifySchema)) body: RegisterVerifyDto,
  ) {
    return this.webauthn.verifyRegistration(user.sub, body.response as unknown as RegistrationResponseJSON, body.deviceName);
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
  loginOptions(@Body(new ZodPipe(loginOptionsSchema)) body: LoginOptionsDto) {
    return this.webauthn.authenticationOptions(body.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('login/verify')
  async loginVerify(
    @Body(new ZodPipe(loginVerifySchema)) body: LoginVerifyDto,
    @Req() req: ReqMeta,
  ) {
    const user = await this.webauthn.verifyAuthentication(body.email, body.response as unknown as AuthenticationResponseJSON);
    return this.auth.issueSession(user, 'webauthn', req.ip, req.headers['user-agent']);
  }
}
