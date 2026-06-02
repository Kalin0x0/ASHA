import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Env } from '@chista/config';
import { prisma } from '@chista/db';
import { ENV } from '../../common/env.module';

/** Stored passkey metadata on the UserCredential.metadata JSON column. */
interface PasskeyMeta {
  publicKey: string; // base64url COSE public key
  counter: number;
  transports?: string[];
  deviceName?: string;
}

interface PendingChallenge {
  challenge: string;
  expiresAt: number;
}

/**
 * WebAuthn / passkey support built on @simplewebauthn/server (MIT). Credentials
 * are stored as UserCredential rows with kind=WEBAUTHN — `secret` holds the
 * base64url credential ID, `metadata` the COSE public key + signature counter.
 *
 * Challenges are held in-memory with a short TTL (consistent with the OIDC
 * state store); a multi-instance deployment should move these to Redis.
 */
@Injectable()
export class WebauthnService {
  private readonly logger = new Logger('WebAuthn');
  private readonly regChallenges = new Map<string, PendingChallenge>(); // userId → challenge
  private readonly authChallenges = new Map<string, PendingChallenge>(); // email → challenge

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** RP ID is the registrable domain; origin is the full URL the browser sees. */
  private rp(): { rpID: string; rpName: string; origin: string } {
    const url = new URL(this.env.CHISTA_PUBLIC_URL);
    return { rpID: url.hostname, rpName: 'Chista', origin: url.origin };
  }

  private prune(map: Map<string, PendingChallenge>) {
    const now = Date.now();
    for (const [k, v] of map) if (v.expiresAt < now) map.delete(k);
  }

  // ── Registration ──────────────────────────────────────────────────────────

  async registrationOptions(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');
    const { rpID, rpName } = this.rp();

    const existing = await prisma.userCredential.findMany({ where: { userId, kind: 'WEBAUTHN' } });
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.displayName ?? user.username,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.secret })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    this.prune(this.regChallenges);
    this.regChallenges.set(userId, { challenge: options.challenge, expiresAt: Date.now() + 5 * 60_000 });
    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON, deviceName?: string) {
    const pending = this.regChallenges.get(userId);
    if (!pending || pending.expiresAt < Date.now()) throw new BadRequestException('Registration challenge expired');
    this.regChallenges.delete(userId);
    const { rpID, origin } = this.rp();

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified');
    }

    const { credential } = verification.registrationInfo;
    const meta: PasskeyMeta = {
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: response.response.transports,
      deviceName: deviceName?.slice(0, 80),
    };
    await prisma.userCredential.create({
      data: { userId, kind: 'WEBAUTHN', secret: credential.id, metadata: meta as object },
    });
    this.logger.log(`Registered passkey for user ${userId}`);
    return { verified: true };
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  async authenticationOptions(email: string) {
    const { rpID } = this.rp();
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      include: { credentials: { where: { kind: 'WEBAUTHN' } } },
    });
    // Always return options (don't leak whether the account exists); if no
    // credentials, allowCredentials is empty and the browser will fail cleanly.
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: (user?.credentials ?? []).map((c) => ({
        id: c.secret,
        transports: (c.metadata as unknown as PasskeyMeta)?.transports as never,
      })),
    });

    this.prune(this.authChallenges);
    this.authChallenges.set(email.toLowerCase(), { challenge: options.challenge, expiresAt: Date.now() + 5 * 60_000 });
    return options;
  }

  /** Verify the assertion and return the authenticated user record. */
  async verifyAuthentication(email: string, response: AuthenticationResponseJSON) {
    const key = email.toLowerCase();
    const pending = this.authChallenges.get(key);
    if (!pending || pending.expiresAt < Date.now()) throw new UnauthorizedException('Login challenge expired');
    this.authChallenges.delete(key);
    const { rpID, origin } = this.rp();

    const user = await prisma.user.findFirst({
      where: { email: key },
      include: { credentials: { where: { kind: 'WEBAUTHN' } } },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');

    const cred = user.credentials.find((c) => c.secret === response.id);
    if (!cred) throw new UnauthorizedException('Unknown passkey');
    const meta = cred.metadata as unknown as PasskeyMeta;

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: cred.secret,
        publicKey: new Uint8Array(Buffer.from(meta.publicKey, 'base64url')),
        counter: meta.counter,
        transports: meta.transports as never,
      },
    });
    if (!verification.verified) throw new UnauthorizedException('Passkey verification failed');

    // Persist the updated signature counter (clone/replay detection).
    await prisma.userCredential.update({
      where: { id: cred.id },
      data: { metadata: { ...meta, counter: verification.authenticationInfo.newCounter } as object },
    });

    return user;
  }

  // ── Management ──────────────────────────────────────────────────────────────

  async listCredentials(userId: string) {
    const creds = await prisma.userCredential.findMany({ where: { userId, kind: 'WEBAUTHN' }, orderBy: { createdAt: 'desc' } });
    return creds.map((c) => ({
      id: c.id,
      deviceName: (c.metadata as unknown as PasskeyMeta)?.deviceName ?? 'Passkey',
      createdAt: c.createdAt,
    }));
  }

  async removeCredential(userId: string, id: string) {
    const res = await prisma.userCredential.deleteMany({ where: { id, userId, kind: 'WEBAUTHN' } });
    if (res.count === 0) throw new BadRequestException('Passkey not found');
    return { ok: true };
  }
}
