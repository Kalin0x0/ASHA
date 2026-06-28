'use client';

import { BrainCircuit, FileCode2, Repeat2, Search, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBugFixes } from '@/lib/hooks';

export default function KnowledgeBasePage() {
  const t = useTranslations('support.knowledge');
  const tFix = useTranslations('support.fix');
  const locale = useLocale();
  const fixes = useBugFixes();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fixes;
    return fixes.filter((f) =>
      `${f.title} ${f.rootCause} ${f.resolution} ${f.tags.join(' ')}`.toLowerCase().includes(q),
    );
  }, [fixes, query]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 ps-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card elevation={1}>
          <EmptyState icon={BrainCircuit} title={t('empty.title')} description={t('empty.description')} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((f) => (
            <Card key={f.id} elevation={1} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-base font-medium leading-snug">{f.title}</h2>
                <Badge variant={f.authoredBy === 'AI' ? 'gold' : 'default'} className="shrink-0">
                  {f.authoredBy === 'AI' && <Sparkles className="size-3" />}
                  {f.authorName ?? (f.authoredBy === 'AI' ? 'AI' : 'Human')}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{tFix('rootCause')}</p>
                  <p className="mt-0.5 leading-relaxed text-foreground/90">{f.rootCause}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{tFix('resolution')}</p>
                  <p className="mt-0.5 leading-relaxed text-foreground/90">{f.resolution}</p>
                </div>
                {f.prevention && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{tFix('prevention')}</p>
                    <p className="mt-0.5 leading-relaxed text-foreground/90">{f.prevention}</p>
                  </div>
                )}
              </div>

              {f.filesTouched.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {f.filesTouched.map((file) => (
                    <span key={file} className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      <FileCode2 className="size-3 shrink-0" /> {file}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                {f.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
                <span className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
                  {f.reusedCount > 0 && (
                    <span className="flex items-center gap-1" title={t('reusedTitle')}>
                      <Repeat2 className="size-3.5" /> {t('reused', { count: f.reusedCount })}
                    </span>
                  )}
                  <span>{fmtDate(f.createdAt)}</span>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
