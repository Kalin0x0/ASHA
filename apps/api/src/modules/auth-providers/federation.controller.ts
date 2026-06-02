import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type LdapLoginDto,
  ldapLoginSchema,
  type LdapTestDto,
  ldapTestSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AuthService } from '../auth/auth.service';
import { FederationService } from './federation.service';
import { LdapService } from './ldap.service';
import { SamlService } from './saml.service';

/** Minimal Express-ish response surface we use (avoids a hard express type dep). */
interface Redirectable {
  redirect: (url: string) => void;
}
interface ReqMeta {
  ip?: string;
  headers: Record<string, string>;
}

@ApiTags('auth-federation')
@Controller('auth')
export class FederationController {
  constructor(
    private readonly saml: SamlService,
    private readonly ldap: LdapService,
    private readonly federation: FederationService,
    private readonly auth: AuthService,
  ) {}

  // ── SAML 2.0 SP-initiated ──────────────────────────────────────────────────
  /** Kick off SP-initiated login: 302 to the IdP SSO URL. */
  @Public()
  @Get('saml/:id/login')
  async samlLogin(@Param('id') id: string, @Query('returnTo') returnTo: string | undefined, @Res() res: Redirectable) {
    const { url } = await this.saml.loginRedirectUrl(id, returnTo ?? '/');
    res.redirect(url);
  }

  /** Assertion Consumer Service: the IdP POSTs SAMLResponse here. */
  @Public()
  @Throttle({ auth: { ttl: 60_000, limit: 20 } })
  @Post('saml/:id/callback')
  async samlCallback(
    @Param('id') id: string,
    @Body() body: { SAMLResponse?: string; RelayState?: string },
    @Req() req: ReqMeta,
  ) {
    if (!body?.SAMLResponse) return { error: 'Missing SAMLResponse' };
    const { orgId, profile } = await this.saml.consumeAssertion(id, body.SAMLResponse);
    const user = await this.federation.provision(orgId, id, profile);
    return this.auth.issueSession(user, 'saml', req.ip, req.headers['user-agent']);
  }

  /** SP metadata XML for the IdP administrator. */
  @Public()
  @Get('saml/:id/metadata')
  @Header('content-type', 'application/xml')
  samlMetadata(@Param('id') id: string) {
    return this.saml.metadata(id);
  }

  // ── LDAP / Active Directory ────────────────────────────────────────────────
  /** Direct LDAP bind login (username + password against the directory). */
  @Public()
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
  @Post('ldap/:orgId/:id/login')
  async ldapLogin(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(ldapLoginSchema)) dto: LdapLoginDto,
    @Req() req: ReqMeta,
  ) {
    const { profile } = await this.ldap.authenticate(orgId, id, dto.username, dto.password);
    const user = await this.federation.provision(orgId, id, profile);
    return this.auth.issueSession(user, 'ldap', req.ip, req.headers['user-agent']);
  }

  /** Admin live-test: bind the service account and optionally resolve a username. */
  @ApiBearerAuth()
  @RequirePermissions('AUTH_MANAGE')
  @Post('providers/:id/ldap-test')
  ldapTest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ldapTestSchema)) dto: LdapTestDto,
  ) {
    return this.ldap.test(user.orgId, id, dto.sampleUsername);
  }
}
