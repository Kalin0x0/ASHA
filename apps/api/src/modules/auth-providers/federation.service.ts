import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@asha/db';

/** A normalized identity extracted from an SSO assertion (SAML/OIDC/LDAP). */
export interface FederatedProfile {
  email: string;
  username?: string;
  displayName?: string;
  /** Raw IdP attributes used to evaluate group mappings (string or string[]). */
  attributes?: Record<string, string | string[] | undefined>;
}

/**
 * Just-in-time user provisioning + group synchronisation for federated logins.
 * On first SSO login a user is created (no local password); on every login the
 * SsoMappings for the provider are evaluated and the user's group membership is
 * reconciled to match the IdP assertion.
 */
@Injectable()
export class FederationService {
  private readonly logger = new Logger('Federation');

  /**
   * Find-or-create the user for an SSO profile, then sync mapped groups.
   * Returns the user record ready for token issuance.
   */
  async provision(orgId: string, authConfigId: string, profile: FederatedProfile) {
    const email = profile.email.toLowerCase();
    const username = profile.username ?? email;

    let user = await prisma.user.findFirst({ where: { orgId, email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          orgId,
          email,
          username,
          displayName: profile.displayName ?? null,
          status: 'ACTIVE',
          // Bind the identity to the provider that created it.
          federatedFrom: authConfigId,
        },
      });
      this.logger.log(`JIT-provisioned SSO user ${email} in org ${orgId}`);
    } else {
      if (user.status !== 'ACTIVE') {
        // A disabled/locked account must not be revived by SSO.
        throw new Error('User account is not active');
      }
      // The account already belongs to a *different* identity provider — refuse
      // to let this IdP shadow it by email. Accounts not yet bound to any IdP
      // (legacy/local) are claimed by the first SSO login that reaches them.
      if (user.federatedFrom && user.federatedFrom !== authConfigId) {
        throw new Error('Account belongs to a different identity provider');
      }
      if (!user.federatedFrom) {
        user = await prisma.user.update({ where: { id: user.id }, data: { federatedFrom: authConfigId } });
      }
    }

    await this.syncGroups(orgId, authConfigId, user.id, profile.attributes ?? {});
    return user;
  }

  /**
   * Reconcile the user's membership in *mapped* groups against the assertion.
   * Only groups that have an SsoMapping for this provider are touched — manual
   * memberships in unmapped groups are preserved.
   */
  async syncGroups(
    orgId: string,
    authConfigId: string,
    userId: string,
    attributes: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const mappings = await prisma.ssoMapping.findMany({ where: { orgId, authConfigId } });
    if (mappings.length === 0) return;

    const managedGroupIds = new Set(mappings.map((m) => m.groupId));
    const shouldBelong = new Set<string>();
    for (const m of mappings) {
      const raw = attributes[m.attribute];
      const values = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      if (values.some((v) => String(v) === m.value)) shouldBelong.add(m.groupId);
    }

    const current = await prisma.userGroup.findMany({ where: { userId, groupId: { in: [...managedGroupIds] } } });
    const currentIds = new Set(current.map((c) => c.groupId));

    // Add memberships the assertion grants.
    for (const groupId of shouldBelong) {
      if (!currentIds.has(groupId)) {
        await prisma.userGroup.create({ data: { orgId, userId, groupId } }).catch(() => undefined);
      }
    }
    // Remove managed memberships the assertion no longer grants.
    for (const groupId of currentIds) {
      if (!shouldBelong.has(groupId)) {
        await prisma.userGroup.deleteMany({ where: { userId, groupId } });
      }
    }
  }
}
