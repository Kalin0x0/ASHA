import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { prisma, runUnscoped } from '@asha/db';

/** Global infrastructure operations cannot be delegated through a tenant role. */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest().user as { sub?: string; orgId?: string } | undefined;
    if (!user?.sub || !user.orgId) throw new ForbiddenException('System administrator required');
    const admin = await runUnscoped(() => prisma.user.findFirst({
      where: { id: user.sub, orgId: user.orgId, isSystemAdmin: true, status: 'ACTIVE' },
      select: { id: true },
    }));
    if (!admin) throw new ForbiddenException('System administrator required');
    return true;
  }
}
