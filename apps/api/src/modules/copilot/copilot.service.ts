import { Injectable } from '@nestjs/common';
import { prisma } from '@asha/db';

const ACTIVE = ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED'];

/**
 * KI-Copilot backend (differentiator). Answers natural-language questions about
 * the org's live platform state (sessions, cost, agents, users) via a
 * deterministic intent router over real data — no hallucinations. Free-form
 * reasoning is a pluggable LLM step (ASHA_COPILOT_*), so the deterministic
 * answers are always available and verifiable while the AI layer is optional.
 */
@Injectable()
export class CopilotService {
  async ask(orgId: string, query: string) {
    const q = query.toLowerCase();

    if (/\b(session|running|active|launch|desktop)/.test(q)) {
      const grouped = await prisma.session.groupBy({
        by: ['status'],
        where: { orgId, status: { notIn: ['DESTROYED'] } },
        _count: { _all: true },
      });
      const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
      const running = byStatus.RUNNING ?? 0;
      const active = grouped.filter((g) => ACTIVE.includes(g.status)).reduce((s, g) => s + g._count._all, 0);
      return {
        intent: 'sessions',
        answer: `${running} session(s) currently RUNNING, ${active} active in total.`,
        data: { running, active, byStatus },
      };
    }

    if (/(cost|spend|spent|bill|finops|budget|\$)/.test(q)) {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 3_600_000);
      const sessions = await prisma.session.findMany({
        where: { orgId, startedAt: { not: null, gte: from } },
        select: { startedAt: true, destroyedAt: true },
      });
      let hours = 0;
      for (const s of sessions) {
        if (!s.startedAt) continue;
        hours += Math.max(0, ((s.destroyedAt ?? to).getTime() - s.startedAt.getTime()) / 3_600_000);
      }
      const est = Math.round(hours * 0.05 * 100) / 100;
      return {
        intent: 'cost',
        answer: `~$${est} estimated over the last 30 days (${Math.round(hours)} session-hours). See GET /reporting/costs for the per-user/workspace breakdown.`,
        data: { sessionHours: Math.round(hours * 10) / 10, estimatedCost: est, currency: 'USD' },
      };
    }

    if (/\b(agent|drain|node|host|capacity)/.test(q)) {
      const grouped = await prisma.agent.groupBy({ by: ['status'], where: { orgId }, _count: { _all: true } });
      const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
      return {
        intent: 'agents',
        answer: `${byStatus.ONLINE ?? 0} agent(s) online, ${byStatus.DRAINING ?? 0} draining, ${byStatus.OFFLINE ?? 0} offline.`,
        data: { byStatus },
      };
    }

    if (/\b(user|admin|account|people|team|member)/.test(q)) {
      const [total, admins] = await Promise.all([
        prisma.user.count({ where: { orgId } }),
        prisma.user.count({ where: { orgId, isSystemAdmin: true, status: 'ACTIVE' } }),
      ]);
      return {
        intent: 'users',
        answer: `${total} user(s), ${admins} active system admin(s).`,
        data: { total, admins },
      };
    }

    return {
      intent: 'unknown',
      answer:
        'I can answer about sessions, cost, agents, and users — try "how many sessions are running?" or "what did we spend this month?". Free-form AI answers require a configured LLM provider (ASHA_COPILOT_*).',
      data: { capabilities: ['sessions', 'cost', 'agents', 'users'] },
    };
  }
}
