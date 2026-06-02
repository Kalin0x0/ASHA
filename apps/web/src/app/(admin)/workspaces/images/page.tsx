'use client';

import { Container, HardDrive, Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useImages } from '@/lib/hooks';

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const STATUS_VARIANT = {
  available: 'success',
  pulling: 'info',
  error: 'destructive',
} as const;

export default function ImagesPage() {
  const images = useImages();
  const [query, setQuery] = useState('');

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
        title="Workspace Images"
        description="Container images pulled and cached on agents. New images are pulled automatically when a workspace is first launched."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Images" value={images.length} icon={Container} primary />
        <StatCard label="Cached size (GB)" value={Math.round(totalSizeMb / 1024)} icon={HardDrive} />
        <StatCard
          label="Workspaces covered"
          value={new Set(images.flatMap((i) => i.workspaces)).size}
          icon={Package}
        />
      </div>

      <div className="max-w-sm">
        <Input
          placeholder="Search by name, registry or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Image</th>
                <th className="px-5 py-3 font-medium">Registry</th>
                <th className="px-5 py-3 font-medium">Tag</th>
                <th className="px-5 py-3 font-medium">Used by</th>
                <th className="px-5 py-3 font-medium">Size</th>
                <th className="px-5 py-3 font-medium">Pulled</th>
                <th className="px-5 py-3 font-medium">Status</th>
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
                    <Badge variant={STATUS_VARIANT[img.status]} className="capitalize">
                      {img.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    No images match your search.
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
