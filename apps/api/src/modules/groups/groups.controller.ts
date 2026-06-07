import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { GroupsService } from './groups.service';

const groupSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  keepaliveExpirationSec: z.number().int().positive().nullable().optional(),
  idleDisconnectSec: z.number().int().positive().nullable().optional(),
  usageLimitSec: z.number().int().positive().nullable().optional(),
  maxConcurrentSessions: z.number().int().positive().nullable().optional(),
  roleIds: z.array(z.string()).optional(),
});
type GroupDto = z.infer<typeof groupSchema>;

const groupUpdateSchema = groupSchema.partial();
type GroupUpdateDto = z.infer<typeof groupUpdateSchema>;

const memberSchema = z.object({ userId: z.string().min(1) });
type MemberDto = z.infer<typeof memberSchema>;

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @RequirePermissions('GROUP_MANAGE')
  @Get()
  list() {
    return this.groups.list();
  }

  @RequirePermissions('GROUP_MANAGE')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.groups.get(id);
  }

  @Audit('group.create', { targetType: 'Group' })
  @RequirePermissions('GROUP_MANAGE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(groupSchema)) dto: GroupDto) {
    return this.groups.create(user, dto);
  }

  @RequirePermissions('GROUP_MANAGE')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(groupUpdateSchema)) dto: GroupUpdateDto) {
    return this.groups.update(id, dto);
  }

  @Audit('group.delete', { targetType: 'Group' })
  @RequirePermissions('GROUP_MANAGE')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }

  @RequirePermissions('GROUP_MANAGE')
  @Post(':id/members')
  addMember(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(memberSchema)) dto: MemberDto) {
    return this.groups.addMember(user, id, dto.userId);
  }

  @RequirePermissions('GROUP_MANAGE')
  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.groups.removeMember(id, userId);
  }
}
