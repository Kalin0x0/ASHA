import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const AGENT_ONLY = 'agentOnly';
/** Routes the agent calls — authenticated by a shared agent token, not a user JWT. */
export const AgentOnly = () => SetMetadata(AGENT_ONLY, true);

export const PERMISSIONS_KEY = 'permissions';
export interface PermissionRequirement {
  permissions: string[];
  mode: 'any' | 'all';
}
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, mode: 'all' } satisfies PermissionRequirement);
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, mode: 'any' } satisfies PermissionRequirement);

export const FEATURE_KEY = 'requiredFeature';
/** Gate a route behind an experimental feature flag enabled for the caller's org (H4). */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

export interface AuthUser {
  sub: string;
  orgId: string;
  email: string;
  isSystemAdmin: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
