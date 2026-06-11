'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLaunchSession, useWorkspaces } from '@/lib/hooks';

export default function WorkspacesPage() {
  const t = useTranslations('workspaces');
  const tc = useTranslations('common');
  const workspaces = useWorkspaces();
  const launch = useLaunchSession();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(workspaces.map((w) => w.category)))],
    [workspaces],
  );

  const filtered = useMemo(
    () =>
      workspaces.filter((w) => {
        if (category !== 'All' && w.category !== category) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return w.friendlyName.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
      }),
    [workspaces, query, category],
  );

  const onLaunch = (id: string) => {
    setLaunchingId(id);
    setTimeout(() => {
      launch(id);
      setLaunchingId(null);
      toast.success(t('catalog.toasts.launchTitle'), { description: t('catalog.toasts.launchDescription') });
    }, 700);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('catalog.title')}
        description={t('catalog.description')}
        actions={
          <Button size="sm">
            <Plus className="size-4" /> {t('catalog.newWorkspace')}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder={t('catalog.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus ${
                category === c
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:text-foreground'
              }`}
            >
              {c === 'All' ? tc('labels.all') : c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            onLaunch={onLaunch}
            launching={launchingId === ws.id}
          />
        ))}
      </div>
    </div>
  );
}
