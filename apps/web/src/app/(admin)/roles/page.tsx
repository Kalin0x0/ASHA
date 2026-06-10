'use client';

import {
  expandRole,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  SUPER_ADMIN,
  SYSTEM_ROLE_MATRIX,
} from '@chista/rbac';
import { Check, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Card } from '@/components/ui/card';

const CATEGORIES = [...new Set(PERMISSION_CATALOG.map((p) => p.category))];

const ROLES = Object.entries(SYSTEM_ROLE_MATRIX).map(([name, def]) => ({
  name,
  keys: new Set(expandRole(def)),
  wildcard: def === SUPER_ADMIN,
}));

export default function RolesPage() {
  const t = useTranslations('access');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('roles.title')}
        description={t('roles.description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <StatCard
            key={r.name}
            label={t(`roles.roleNames.${r.name}`)}
            value={r.keys.size}
            suffix={`/ ${PERMISSION_KEYS.length}`}
            icon={ShieldCheck}
            primary={r.wildcard}
          />
        ))}
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[color-mix(in_srgb,var(--surface-2)_45%,transparent)] text-start text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t('roles.table.permission')}</th>
                {ROLES.map((r) => (
                  <th key={r.name} className="px-4 py-3 text-center font-medium">
                    {t(`roles.roleNames.${r.name}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => (
                <Fragment key={cat}>
                  <tr className="bg-secondary/30">
                    <td
                      colSpan={ROLES.length + 1}
                      className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-gold-300/80"
                    >
                      {t(`roles.categories.${cat}`)}
                    </td>
                  </tr>
                  {PERMISSION_CATALOG.filter((p) => p.category === cat).map((p) => (
                    <tr key={p.key} className="border-b border-border-subtle/50 transition-all duration-150 last:border-0 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{t(`roles.permissions.${p.key}`)}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{p.key}</p>
                      </td>
                      {ROLES.map((r) => (
                        <td key={r.name} className="px-4 py-2.5 text-center">
                          {r.keys.has(p.key) ? (
                            <Check className="mx-auto size-4 text-success" />
                          ) : (
                            <span className="text-muted-foreground/30">·</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
