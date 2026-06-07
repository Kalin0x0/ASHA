import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Step-up guard (C4): blocks unless the caller presented a step-up token
 * (`acr: 'step-up'`, minted by POST /auth/step-up after a fresh TOTP/passkey
 * challenge). Apply via @UseGuards(StepUpGuard) to sensitive operations.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as { acr?: string } | undefined;
    if (user?.acr !== 'step-up') {
      throw new ForbiddenException('This action requires step-up authentication (POST /auth/step-up)');
    }
    return true;
  }
}
