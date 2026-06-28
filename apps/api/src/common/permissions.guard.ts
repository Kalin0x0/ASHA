import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@asha/rbac';
import { AGENT_ONLY, IS_PUBLIC, PERMISSIONS_KEY, type PermissionRequirement } from './decorators';
import { RbacService } from './rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = [ctx.getHandler(), ctx.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, meta) ||
      this.reflector.getAllAndOverride<boolean>(AGENT_ONLY, meta)
    ) {
      return true;
    }

    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(PERMISSIONS_KEY, meta);
    if (!requirement || requirement.permissions.length === 0) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException();
    if (user.isSystemAdmin) return true;

    const granted = await this.rbac.effectivePermissions(user.sub);
    if (!hasPermission(granted, requirement.permissions, requirement.mode)) {
      throw new ForbiddenException(`Missing permission: ${requirement.permissions.join(', ')}`);
    }
    return true;
  }
}
