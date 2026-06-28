import { Injectable } from '@nestjs/common';
import { prisma } from '@asha/db';

export interface PolicyDoc {
  /** Max number of ACTIVE system admins allowed. */
  maxSystemAdmins?: number;
  /** Every group must have an idle-disconnect timeout set. */
  groupIdleTimeoutRequired?: boolean;
  /** Every workspace's DLP must set `field` to `value` (e.g. downloads=false). */
  workspaceDlpRequired?: { field: string; value?: unknown };
}

interface Violation {
  rule: string;
  subject: string;
  detail: string;
}

/**
 * Policy-as-Code (differentiator) — evaluate the org's CURRENT state against a
 * declarative policy document and report drift. Read-only: it reports
 * violations, it never mutates. A GitOps pipeline can fail on a non-compliant
 * result before promoting config (or schedule it via the loop runner).
 */
@Injectable()
export class PolicyService {
  async evaluate(orgId: string, policy: PolicyDoc) {
    const violations: Violation[] = [];
    let rulesChecked = 0;

    if (typeof policy.maxSystemAdmins === 'number') {
      rulesChecked += 1;
      const admins = await prisma.user.count({ where: { orgId, isSystemAdmin: true, status: 'ACTIVE' } });
      if (admins > policy.maxSystemAdmins) {
        violations.push({
          rule: 'maxSystemAdmins',
          subject: 'org',
          detail: `${admins} active system admins exceed the limit of ${policy.maxSystemAdmins}`,
        });
      }
    }

    if (policy.groupIdleTimeoutRequired) {
      rulesChecked += 1;
      const groups = await prisma.group.findMany({
        where: { orgId, idleDisconnectSec: null },
        select: { name: true },
      });
      for (const g of groups) {
        violations.push({
          rule: 'groupIdleTimeoutRequired',
          subject: `group:${g.name}`,
          detail: 'idleDisconnectSec is not set',
        });
      }
    }

    if (policy.workspaceDlpRequired) {
      rulesChecked += 1;
      const { field, value } = policy.workspaceDlpRequired;
      const workspaces = await prisma.workspace.findMany({
        where: { orgId },
        select: { friendlyName: true, dlp: true },
      });
      for (const w of workspaces) {
        const dlp = (w.dlp ?? {}) as Record<string, unknown>;
        if (dlp[field] !== value) {
          violations.push({
            rule: 'workspaceDlpRequired',
            subject: `workspace:${w.friendlyName}`,
            detail: `dlp.${field}=${JSON.stringify(dlp[field] ?? null)}, required ${JSON.stringify(value)}`,
          });
        }
      }
    }

    return {
      rulesChecked,
      compliant: violations.length === 0,
      violationCount: violations.length,
      violations,
    };
  }
}
