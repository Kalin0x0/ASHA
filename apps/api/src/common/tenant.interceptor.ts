import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithTenant } from '@asha/db';

/**
 * Runs the request handler inside an AsyncLocalStorage tenant context so the
 * Prisma client extension auto-scopes every tenant-owned query by orgId.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.orgId) return next.handle();

    return new Observable((subscriber) => {
      runWithTenant({ orgId: user.orgId, actorUserId: user.sub }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
