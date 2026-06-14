'use client';

import { CheckCircle2, Plus, RefreshCw, Rocket, Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { CHANGELOG, CURRENT_VERSION, type ChangeType, localize } from '@/lib/changelog';
import { PageHeader } from '@/components/composite/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const TYPE_META: Record<ChangeType, { variant: BadgeProps['variant']; icon: typeof Plus; dot: string; text: string }> = {
  added: { variant: 'success', icon: Plus, dot: 'bg-success', text: 'text-success' },
  fixed: { variant: 'warning', icon: Wrench, dot: 'bg-warning', text: 'text-warning' },
  changed: { variant: 'info', icon: RefreshCw, dot: 'bg-info', text: 'text-info' },
};
const TYPE_ORDER: ChangeType[] = ['added', 'fixed', 'changed'];

function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

export default function UpdatesPage() {
  const t = useTranslations('developer.updates');
  const locale = useLocale();
  const latest = CHANGELOG[0];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Current version banner */}
      <Card elevation="gold" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(212,175,55,0.35)] bg-gold-500/10 text-gold-300">
          <Rocket className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('currentVersion')}</p>
          <p className="font-display text-2xl font-semibold text-foreground" dir="ltr">
            v{CURRENT_VERSION}
          </p>
        </div>
        <div className="sm:ms-auto">
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(95,184,143,0.3)] bg-[rgba(95,184,143,0.1)] px-3 py-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t('upToDate')}
          </span>
        </div>
      </Card>

      {/* Release timeline */}
      <div className="space-y-4">
        {CHANGELOG.map((release) => {
          const isLatest = release === latest;
          const grouped = TYPE_ORDER.map((type) => ({
            type,
            items: release.changes.filter((c) => c.type === type),
          })).filter((g) => g.items.length > 0);

          return (
            <Card key={release.version} elevation={1} className={cn('p-5', isLatest && 'gold-hairline')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge variant={isLatest ? 'gold' : 'outline'} className="text-sm" >
                  <span dir="ltr">v{release.version}</span>
                </Badge>
                {isLatest && (
                  <Badge variant="success">{t('latest')}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(release.date, locale)}</span>
                {release.title && (
                  <span className="w-full text-sm font-medium text-foreground sm:w-auto">
                    {localize(release.title, locale)}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {grouped.map(({ type, items }) => {
                  const meta = TYPE_META[type];
                  const Icon = meta.icon;
                  return (
                    <div key={type}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <Icon className={cn('size-3.5', meta.text)} />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(`types.${type}`)}
                        </span>
                      </div>
                      <ul className="space-y-1.5 ps-1">
                        {items.map((item, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-foreground/90">
                            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', meta.dot)} />
                            <span>{localize(item.text, locale)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
