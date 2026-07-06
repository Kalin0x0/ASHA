import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AccountService } from './account.service';

const updateAccountSchema = z.object({
  displayName: z.string().max(120).nullish(),
  locale: z.string().min(2).max(10).optional(),
  avatarUrl: z.string().max(1_600_000).nullish(),
  email: z.string().email().optional(),
});
type UpdateAccountDto = z.infer<typeof updateAccountSchema>;

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(200),
});
type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

/**
 * Self-service profile. Authenticated, any role — no `@RequirePermissions`, and
 * every method targets `user.sub`, so a user can only manage their own account.
 */
@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.account.getProfile(user);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateAccountSchema)) dto: UpdateAccountDto) {
    return this.account.updateProfile(user, dto);
  }

  @Post('password')
  changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) dto: ChangePasswordDto) {
    return this.account.changePassword(user, dto);
  }
}
