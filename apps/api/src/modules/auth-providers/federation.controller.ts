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
import { OidcService } from './oidc.service';
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
    private readonly oidc: OidcService,
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

  // ── OIDC Authorization Code + PKCE ────────────────────────────────────────

  /** Redirect the browser to the IdP authorization endpoint. */
  @Public()
  @Get('oidc/:id/login')
  async oidcLogin(
    @Param('id') id: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Redirectable,
  ) {
    const { url } = await this.oidc.authorizationUrl(id, returnTo ?? '/');
    res.redirect(url);
  }

  /**
   * OIDC callback: receives `code` + `state`, exchanges for tokens, fetches
   * UserInfo, provisions/updates the user, and issues a Chista session.
   */
  @Public()
  @Throttle({ auth: { ttl: 60_000, limit: 20 } })
  @Get('oidc/:id/callback')
  async oidcCallback(
    @Param('id') id: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: ReqMeta,
  ) {
    if (error) return { error };
    if (!code || !state) return { error: 'Missing code or state' };
    const { orgId, profile, returnTo: _returnTo } = await this.oidc.handleCallback(id, code, state);
    const user = await this.federation.provision(orgId, id, profile);
    return this.auth.issueSession(user, 'oidc', req.ip, req.headers['user-agent']);
  }

  /**
   * OIDC RP-initiated logout: 302 to the IdP end_session_endpoint so the IdP
   * session is also terminated, then back to postLogoutRedirect.
   */
  @Public()
  @Get('oidc/:id/logout')
  async oidcLogout(
    @Param('id') id: string,
    @Query('returnTo') returnTo: string | undefined,
    @Query('idTokenHint') idTokenHint: string | undefined,
    @Res() res: Redirectable,
  ) {
    const postLogout = returnTo ?? `${process.env.CHISTA_BASE_URL ?? ''}/login`;
    const { url } = await this.oidc.logoutUrl(id, postLogout, idTokenHint);
    res.redirect(url);
  }

  /**
   * SAML SP-initiated Single Logout: 302 to the IdP SLO endpoint. `nameID`
   * (and optionally `sessionIndex`) identify the subject's IdP session. If the
   * IdP advertises no SLO endpoint, redirect to the local post-logout target.
   */
  @Public()
  @Get('saml/:id/logout')
  async samlLogout(
    @Param('id') id: string,
    @Query('nameID') nameID: string | undefined,
    @Query('sessionIndex') sessionIndex: string | undefined,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Redirectable,
  ) {
    const relayState = returnTo ?? '/login';
    if (!nameID) {
      res.redirect(relayState);
      return;
    }
    try {
      const { url } = await this.saml.logoutRedirectUrl(id, { nameID, sessionIndex }, relayState);
      res.redirect(url);
    } catch {
      // IdP has no SLO endpoint (or rejected) — fall back to local logout.
      res.redirect(relayState);
    }
  }
}
