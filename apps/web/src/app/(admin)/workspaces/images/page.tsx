'use client';

import { Container, HardDrive, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useImages } from '@/lib/hooks';

const STATUS_VARIANT = {
  available: 'success',
  pulling: 'info',
  error: 'destructive',
} as const;

export default function ImagesPage() {
  const t = useTranslations('workspaces');
  const tc = useTranslations('common');
  const images = useImages();
  const [query, setQuery] = useState('');

  const formatSize = (mb: number): string => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ${tc('units.gb')}`;
    return `${mb} ${tc('units.mb')}`;
  };

  const formatAge = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days === 0) return t('images.age.today');
    if (days === 1) return t('images.age.yesterday');
    return t('images.age.daysAgo', { days });
  };

  const filtered = useMemo(() => {
    if (!query) return images;
    const q = query.toLowerCase();
    return images.filter(
      (img) =>
        img.name.toLowerCase().includes(q) ||
        img.registry.toLowerCase().includes(q) ||
        img.tag.toLowerCase().includes(q),
    );
  }, [images, query]);

  const totalSizeMb = images.reduce((s, i) => s + i.sizeMb, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('images.title')}
        description={t('images.description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('images.stats.images')} value={images.length} icon={Container} primary />
        <StatCard label={t('images.stats.cachedSize')} value={Math.round(totalSizeMb / 1024)} icon={HardDrive} />
        <StatCard
          label={t('images.stats.workspacesCovered')}
          value={new Set(images.flatMap((i) => i.workspaces)).size}
          icon={Package}
        />
      </div>

      <div className="max-w-sm">
        <Input
          placeholder={t('images.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t('images.table.image')}</th>
                <th className="px-5 py-3 font-medium">{t('images.table.registry')}</th>
                <th className="px-5 py-3 font-medium">{t('images.table.tag')}</th>
                <th className="px-5 py-3 font-medium">{t('images.table.usedBy')}</th>
                <th className="px-5 py-3 font-medium">{t('images.table.size')}</th>
                <th className="px-5 py-3 font-medium">{t('images.table.pulled')}</th>
                <th className="px-5 py-3 font-medium">{tc('labels.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((img) => (
                <tr
                  key={img.id}
                  className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 text-gold-300">
                        <Container className="size-4" />
                      </span>
                      <span className="font-mono font-medium">{img.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{img.registry}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className="font-mono">
                      {img.tag}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {img.workspaces.map((w) => (
                        <Badge key={w} variant="outline">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 tnum text-muted-foreground">{formatSize(img.sizeMb)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatAge(img.pulledAt)}</td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[img.status]}>
                      {t(`images.status.${img.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    {t('images.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
