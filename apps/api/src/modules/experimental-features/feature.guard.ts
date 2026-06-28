import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthUser, FEATURE_KEY } from '../../common/decorators';
import { ExperimentalFeaturesService } from './experimental-features.service';

/**
 * Applied per-route via @UseGuards(FeatureGuard); blocks unless the route's
 * @RequireFeature flag is enabled for the caller's org. Runs after the global
 * JwtAuthGuard, so req.user is populated.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: ExperimentalFeaturesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user?.orgId) throw new ForbiddenException('Feature gate requires an authenticated org');
    if (!(await this.features.isEnabled(user.orgId, required))) {
      throw new ForbiddenException(`Experimental feature "${required}" is not enabled for this org`);
    }
    return true;
  }
}
