import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { BugReportsService } from './bug-reports.service';

const severity = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const status = z.enum(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX', 'DUPLICATE']);

const createSchema = z.object({
  title: z.string().min(3).max(240),
  description: z.string().min(1).max(20_000),
  severity: severity.optional(),
  route: z.string().max(500).optional(),
  component: z.string().max(40).optional(),
  appVersion: z.string().max(60).optional(),
  userAgent: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const ingestSchema = z.object({
  errorName: z.string().max(200).optional(),
  message: z.string().min(1).max(20_000),
  stack: z.string().max(50_000).optional(),
  route: z.string().max(500).optional(),
  component: z.string().max(40).optional(),
  appVersion: z.string().max(60).optional(),
  userAgent: z.string().max(500).optional(),
  httpStatus: z.number().int().optional(),
  severity: severity.optional(),
  metadata: z.record(z.unknown()).optional(),
});
type IngestDto = z.infer<typeof ingestSchema>;

const updateSchema = z
  .object({ status: status.optional(), severity: severity.optional() })
  .refine((v) => v.status !== undefined || v.severity !== undefined, {
    message: 'Provide at least one of status or severity',
  });
type UpdateDto = z.infer<typeof updateSchema>;

const resolveSchema = z.object({
  rootCause: z.string().min(1).max(20_000),
  resolution: z.string().min(1).max(20_000),
  prevention: z.string().max(20_000).optional(),
  filesTouched: z.array(z.string().max(500)).max(200).optional(),
  commitRef: z.string().max(200).optional(),
  authoredBy: z.enum(['AI', 'HUMAN']).optional(),
  authorName: z.string().max(120).optional(),
  tags: z.array(z.string().max(60)).max(40).optional(),
});
type ResolveDto = z.infer<typeof resolveSchema>;

@ApiTags('bug-reports')
@ApiBearerAuth()
@Controller('bug-reports')
export class BugReportsController {
  constructor(private readonly bugs: BugReportsService) {}

  // ── Intake (any authenticated user — reporting needs no special permission) ──

  /** File a bug from the portal / admin UI. */
  @Audit('bug.report', { targetType: 'BugReport' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    return this.bugs.create(user, dto);
  }

  /** Automatic intake for a captured crash (web error boundary / window handlers). */
  @Post('ingest')
  ingest(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ingestSchema)) dto: IngestDto, @Req() req: { headers: Record<string, string | undefined> }) {
    return this.bugs.ingest(user.orgId, { userAgent: req.headers['user-agent'], ...dto }, {
      id: user.sub,
      email: user.email,
    });
  }

  // ── Triage surface (static routes before the :id param) ──────────────────────

  @RequirePermissions('BUG_VIEW')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') s?: string,
    @Query('severity') sev?: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
  ) {
    return this.bugs.list(user, {
      status: s as never,
      severity: sev as never,
      source: source as never,
      q,
    });
  }

  @RequirePermissions('BUG_VIEW')
  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.bugs.stats(user);
  }

  /** The fix memory — every documented resolution, searchable. */
  @RequirePermissions('BUG_VIEW')
  @Get('knowledge')
  knowledge(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.bugs.listKnowledge(user, q);
  }

  @RequirePermissions('BUG_VIEW')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bugs.get(user, id);
  }

  @Audit('bug.update', { targetType: 'BugReport' })
  @RequirePermissions('BUG_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateSchema)) dto: UpdateDto,
  ) {
    return this.bugs.update(user, id, dto);
  }

  /** Mark resolved AND document the fix into the central memory. */
  @Audit('bug.resolve', { targetType: 'BugReport' })
  @RequirePermissions('BUG_MANAGE')
  @Post(':id/resolve')
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(resolveSchema)) dto: ResolveDto,
  ) {
    return this.bugs.resolve(user, id, dto);
  }
}
