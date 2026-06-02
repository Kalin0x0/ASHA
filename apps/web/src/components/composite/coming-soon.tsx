import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function ComingSoon({
  title,
  description,
  icon: Icon,
  phase = 2,
  section,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  phase?: number;
  section?: string;
}) {
  return (
    <Card elevation={1} className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.18]" />
      <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
        <span className="relative flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
          <Icon className="size-7" />
          <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5" />
        </span>

        <div className="space-y-2">
          {section && (
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {section}
            </span>
          )}
          <h2 className="font-display text-2xl font-medium">{title}</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description ??
              'This module is fully modeled in the data layer and API surface. The management interface lands in an upcoming phase.'}
          </p>
        </div>

        <Badge variant="gold" className="gap-1.5">
          <Sparkles className="size-3" />
          Planned · Phase {phase}
        </Badge>
      </div>
    </Card>
  );
}
