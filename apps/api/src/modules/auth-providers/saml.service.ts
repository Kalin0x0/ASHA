import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SAML, type SamlConfig } from '@node-saml/node-saml';
import { prisma } from '@chista/db';
import type { Env } from '@chista/config';
import { ENV } from '../../common/env.module';
import type { FederatedProfile } from './federation.service';

/**
 * SAML 2.0 SP-initiated authentication on top of the open-source
 * `@node-saml/node-saml` (MIT) library. Each AuthConfig of type SAML stores its
 * IdP settings in `config`:
 *   { entryPoint|ssoUrl, idpCert|cert, spEntityId, idpMetadataUrl?, wantAssertionsSigned? }
 */
@Injectable()
export class SamlService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Where the IdP POSTs its assertion back to (the SP ACS endpoint). */
  callbackUrl(id: string): string {
    return `${this.env.CHISTA_PUBLIC_URL.replace(/\/$/, '')}/api/v1/auth/saml/${id}/callback`;
  }

  private async load(orgId: string | undefined, id: string) {
    const cfg = await prisma.authConfig.findFirst({
      where: { id, type: 'SAML', ...(orgId ? { orgId } : {}) },
    });
    if (!cfg) throw new NotFoundException('SAML provider not found');
    if (!cfg.enabled) throw new BadRequestException('SAML provider is disabled');
    return cfg;
  }

  private buildClient(id: string, config: Record<string, unknown>): SAML {
    const entryPoint = (config.entryPoint ?? config.ssoUrl) as string | undefined;
    const idpCert = (config.idpCert ?? config.cert) as string | undefined;
    if (!entryPoint || !idpCert) {
      throw new BadRequestException('SAML config requires entryPoint and idpCert');
    }
    const opts: SamlConfig = {
      callbackUrl: this.callbackUrl(id),
      entryPoint,
      idpCert,
      issuer: (config.spEntityId as string) ?? this.callbackUrl(id),
      wantAssertionsSigned: config.wantAssertionsSigned !== false,
      wantAuthnResponseSigned: false,
      audience: (config.audience as string) ?? false,
    };
    return new SAML(opts);
  }

  /** Build the IdP redirect URL for an SP-initiated login. */
  async loginRedirectUrl(id: string, relayState = '/'): Promise<{ url: string; orgId: string }> {
    const cfg = await this.load(undefined, id);
    const client = this.buildClient(id, cfg.config as Record<string, unknown>);
    const url = await client.getAuthorizeUrlAsync(relayState, undefined as never, {} as never);
    return { url, orgId: cfg.orgId };
  }

  /** Validate the IdP's SAMLResponse and return a normalized profile. */
  async consumeAssertion(
    id: string,
    samlResponse: string,
  ): Promise<{ orgId: string; profile: FederatedProfile }> {
    const cfg = await this.load(undefined, id);
    const client = this.buildClient(id, cfg.config as Record<string, unknown>);
    let profile: Record<string, unknown> | null;
    try {
      const result = await client.validatePostResponseAsync({ SAMLResponse: samlResponse });
      profile = (result.profile ?? null) as Record<string, unknown> | null;
    } catch (e) {
      throw new BadRequestException(`SAML assertion rejected: ${(e as Error).message}`);
    }
    if (!profile) throw new BadRequestException('SAML assertion contained no profile');

    const attributes = (profile.attributes as Record<string, string | string[]>) ?? {};
    const email =
      (profile.email as string) ??
      (profile.nameID as string) ??
      (attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] as string);
    if (!email) throw new BadRequestException('SAML assertion had no email / NameID');

    return {
      orgId: cfg.orgId,
      profile: {
        email,
        username: (profile.nameID as string) ?? email,
        displayName: (profile.displayName as string) ?? (attributes.displayName as string) ?? undefined,
        attributes,
      },
    };
  }

  /** SP metadata XML for handing to the IdP administrator. */
  async metadata(id: string): Promise<string> {
    const cfg = await this.load(undefined, id);
    const client = this.buildClient(id, cfg.config as Record<string, unknown>);
    return client.generateServiceProviderMetadata(null, null);
  }

  /**
   * SP-initiated Single Logout (SLO). Builds the IdP logout redirect URL for the
   * given subject. `nameID` (and ideally `sessionIndex`) come from the original
   * assertion. When the IdP advertises no SLO endpoint node-saml throws, and the
   * call site falls back to a local-only logout.
   */
  async logoutRedirectUrl(
    id: string,
    subject: { nameID: string; nameIDFormat?: string; sessionIndex?: string },
    relayState = '/',
  ): Promise<{ url: string }> {
    const cfg = await this.load(undefined, id);
    const client = this.buildClient(id, cfg.config as Record<string, unknown>);
    const url = await client.getLogoutUrlAsync(subject as never, relayState, {} as never);
    return { url };
  }
}
