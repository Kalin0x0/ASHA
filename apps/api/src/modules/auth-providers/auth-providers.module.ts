import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthProvidersController } from './auth-providers.controller';
import { AuthProvidersService } from './auth-providers.service';
import { FederationController } from './federation.controller';
import { FederationService } from './federation.service';
import { LdapService } from './ldap.service';
import { OidcService } from './oidc.service';
import { SamlService } from './saml.service';

@Module({
  imports: [AuthModule],
  controllers: [AuthProvidersController, FederationController],
  providers: [AuthProvidersService, FederationService, SamlService, LdapService, OidcService],
  exports: [FederationService],
})
export class AuthProvidersModule {}
