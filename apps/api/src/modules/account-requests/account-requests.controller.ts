import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AccountRequestsService } from './account-requests.service';

const submitSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(64).optional(),
  displayName: z.string().max(120).optional(),
  reason: z.string().max(2000).optional(),
  password: z.string().min(8).max(200),
});
type SubmitDto = z.infer<typeof submitSchema>;

const approveSchema = z.object({
  deactivatesAt: z.string().datetime().nullable().optional(),
  groupId: z.string().min(1).optional(),
  username: z.string().min(1).max(64).optional(),
  note: z.string().max(2000).optional(),
});
type ApproveDto = z.infer<typeof approveSchema>;

const rejectSchema = z.object({ note: z.string().max(2000).optional() });
type RejectDto = z.infer<typeof rejectSchema>;

const settingsSchema = z.object({ enabled: z.boolean() });
type SettingsDto = z.infer<typeof settingsSchema>;

/** Client IP, preferring the proxy header (the stack runs behind Traefik/NPM). */
function clientIp(req: { ip?: string; headers: Record<string, string | undefined> }): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) || req.ip;
}

/**
 * Public sign-up requests + the admin review queue.
 *
 * The two public routes are throttled hard (3/min per IP, same budget as the
 * demo) because they are reachable without credentials. Everything that changes
 * state on the admin side is audited and permission-guarded.
 */
@ApiTags('account-requests')
@Controller('account-requests')
export class AccountRequestsController {
  constructor(private readonly requests: AccountRequestsService) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  /**
   * Read-only and cheap, so it keeps the global throttle rather than the strict
   * submit budget — the sign-in page calls it on every load and must not 429.
   */
  @Public()
  @Get('config')
  config() {
    return this.requests.getConfig();
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: Number(process.env.ASHA_THROTTLE_SIGNUP_LIMIT) || 3 } })
  @Post()
  submit(
    @Body(new ZodPipe(submitSchema)) dto: SubmitDto,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
  ) {
    return this.requests.submit({ ...dto, ip: clientIp(req), userAgent: req.headers['user-agent'] });
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @RequirePermissions('USER_VIEW')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.requests.list(user, status);
  }

  @ApiBearerAuth()
  @RequirePermissions('USER_VIEW')
  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.requests.stats(user);
  }

  @ApiBearerAuth()
  @RequirePermissions('USER_VIEW')
  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.requests.getSettings(user);
  }

  /** Opening public sign-up changes the deployment's attack surface. */
  @ApiBearerAuth()
  @Audit('account_request.settings', { targetType: 'Setting' })
  @RequirePermissions('SETTINGS_MANAGE')
  @Put('settings')
  setSettings(@CurrentUser() user: AuthUser, @Body(new ZodPipe(settingsSchema)) dto: SettingsDto) {
    return this.requests.setSettings(user, dto.enabled);
  }

  /** Approving mints a real account, so it needs the same right as creating one. */
  @ApiBearerAuth()
  @Audit('account_request.approve', { targetType: 'AccountRequest' })
  @RequirePermissions('USER_CREATE')
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(approveSchema)) dto: ApproveDto,
  ) {
    return this.requests.approve(user, id, dto);
  }

  @ApiBearerAuth()
  @Audit('account_request.reject', { targetType: 'AccountRequest' })
  @RequirePermissions('USER_CREATE')
  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(rejectSchema)) dto: RejectDto) {
    return this.requests.reject(user, id, dto.note);
  }

  @ApiBearerAuth()
  @Audit('account_request.delete', { targetType: 'AccountRequest' })
  @RequirePermissions('USER_DELETE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.remove(user, id);
  }
}
