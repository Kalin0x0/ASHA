import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CreateWebhookDto, UpdateWebhookDto } from '@chista/contracts';
import type { Env } from '@chista/config';
import { seal, unseal } from '@chista/crypto';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';
import { ENV } from '../../common/env.module';

/**
 * Outbound webhooks: operators register an endpoint + event filter; the
 * platform POSTs signed JSON when a matching event fires. Each delivery is
 * recorded with its HTTP status for observability/retry.
 *
 * Signature: HMAC-SHA256 over the raw JSON body, keyed by the webhook secret,
 * sent as `X-Chista-Signature: sha256=<hex>` (GitHub-style) so receivers can
 * verify authenticity.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Seal a webhook signing secret; returns null when no secret is set. */
  private sealSecret(secret: string | undefined | null): string | null {
    return secret ? seal(secret, this.env.SECRET_SEAL_KEY) : null;
  }

  /**
   * Recover the plaintext HMAC key. New records store the sealed blob; legacy
   * records stored plaintext — detect by trying unseal first.
   */
  private unsealSecret(stored: string | null): string | null {
    if (!stored) return null;
    try {
      return unseal(stored, this.env.SECRET_SEAL_KEY);
    } catch {
      return stored; // legacy plaintext fallback
    }
  }

  list(orgId: string) {
    return prisma.webhook.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { deliveries: true } } },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreateWebhookDto) {
    const created = await prisma.webhook.create({
      data: {
        orgId,
        name: dto.name,
        url: dto.url,
        events: dto.events,
        secret: this.sealSecret(dto.secret),
        enabled: dto.enabled,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'webhook.create',
      targetType: 'Webhook',
      targetId: created.id,
    });
    return this.redact(created);
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateWebhookDto) {
    const res = await prisma.webhook.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        url: dto.url,
        events: dto.events,
        secret: dto.secret !== undefined ? this.sealSecret(dto.secret) : undefined,
        enabled: dto.enabled,
      },
    });
    if (res.count === 0) throw new NotFoundException('Webhook not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'webhook.update',
      targetType: 'Webhook',
      targetId: id,
    });
    const updated = await prisma.webhook.findFirst({ where: { id, orgId } });
    return updated ? this.redact(updated) : null;
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.webhook.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Webhook not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'webhook.delete',
      targetType: 'Webhook',
      targetId: id,
    });
    return { ok: true };
  }

  listDeliveries(orgId: string, webhookId: string) {
    return prisma.webhookDelivery.findMany({
      where: { webhookId, webhook: { orgId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Fire a test event so an operator can confirm their endpoint is reachable. */
  async test(orgId: string, id: string) {
    const hook = await prisma.webhook.findFirst({ where: { id, orgId } });
    if (!hook) throw new NotFoundException('Webhook not found');
    return this.deliver(hook, 'webhook.test', { message: 'Chista test event', at: new Date().toISOString() });
  }

  /**
   * Dispatch an event to every enabled webhook in the org that subscribes to it.
   * Called by other services when domain events occur. Failures are logged +
   * recorded but never throw into the caller's request path.
   */
  async dispatch(orgId: string, event: string, payload: Record<string, unknown>) {
    const hooks = await prisma.webhook.findMany({
      where: { orgId, enabled: true, events: { has: event } },
    });
    await Promise.all(hooks.map((h) => this.deliver(h, event, payload)));
  }

  private async deliver(
    hook: { id: string; url: string; secret: string | null },
    event: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'Chista-Webhooks/1.0',
      'x-chista-event': event,
    };
    const plainSecret = this.unsealSecret(hook.secret);
    if (plainSecret) {
      const sig = createHmac('sha256', plainSecret).update(body).digest('hex');
      headers['x-chista-signature'] = `sha256=${sig}`;
    }

    let status: 'SUCCESS' | 'FAILED' = 'FAILED';
    let responseCode: number | null = null;
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      responseCode = res.status;
      status = res.ok ? 'SUCCESS' : 'FAILED';
    } catch (err) {
      this.logger.warn(`Webhook ${hook.id} delivery failed: ${(err as Error).message}`);
    }

    await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event,
        status,
        attempts: 1,
        responseCode,
        payload: payload as object,
      },
    });
    return { status, responseCode };
  }

  /** Never leak the secret back to clients; expose only whether one is set. */
  private redact<T extends { secret: string | null }>(hook: T): Omit<T, 'secret'> & { hasSecret: boolean } {
    const { secret, ...rest } = hook;
    return { ...rest, hasSecret: Boolean(secret) };
  }
}
