import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import type { AuthUser } from './decorators';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  /** Action name, e.g. "user.create". */
  action: string;
  /** Target entity type, e.g. "User". */
  targetType?: string;
  /** Route param to read the target id from; falls back to `:id` then the response `.id`. */
  targetParam?: string;
}

/**
 * Declaratively record an audit entry after a handler succeeds. The
 * AuditInterceptor (registered globally) reads this metadata; handlers without
 * it are untouched, so auditing is opt-in per route.
 */
export const Audit = (action: string, opts: Omit<AuditMeta, 'action'> = {}) =>
  SetMetadata(AUDIT_KEY, { action, ...opts } satisfies AuditMeta);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    const xff = req.headers?.['x-forwarded-for'];
    const ip = ((Array.isArray(xff) ? xff[0] : xff) as string | undefined)?.split(',')[0]?.trim() ?? req.ip;

    return next.handle().pipe(
      // Only record on success; a thrown handler skips the tap.
      tap((result) => {
        const targetId =
          (meta.targetParam ? req.params?.[meta.targetParam] : undefined) ??
          req.params?.id ??
          (result && typeof result === 'object' ? (result as { id?: string }).id : undefined);
        void this.audit.record({
          orgId: user?.orgId,
          actorUserId: user?.sub,
          action: meta.action,
          targetType: meta.targetType,
          targetId,
          ip,
          userAgent: req.headers?.['user-agent'] as string | undefined,
          // Preserve the real admin when the action happens under impersonation.
          metadata: (user as { act?: { sub?: string } } | undefined)?.act?.sub
            ? { impersonatedBy: (user as { act: { sub: string } }).act.sub }
            : {},
        });
      }),
    );
  }
}
