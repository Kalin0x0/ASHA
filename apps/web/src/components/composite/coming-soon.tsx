import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function ComingSoon({
  title,
  description,
  icon: Icon,
  section,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  section?: string;
}) {
  return (
    <Card elevation={1} className="relative overflow-hidden">
      {/* Aurora inner glow */}
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.15]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--surface-1)]/60" />

      <div className="relative flex flex-col items-center gap-7 px-6 py-28 text-center animate-fade-up">
        {/* Icon stack */}
        <div className="relative flex items-end justify-center animate-float">
          <Image
            src="/chista-logo.svg"
            alt=""
            width={60}
            height={60}
            unoptimized
            className="opacity-20"
          />
          <span className="absolute -bottom-2 -right-2 flex size-11 items-center justify-center rounded-xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300 shadow-[0_0_20px_-4px_rgba(212,175,55,0.3)] ring-1 ring-inset ring-white/5">
            <Icon className="size-5" />
          </span>
        </div>

        <div className="space-y-2.5">
          {section && (
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50">
              {section}
            </span>
          )}
          <h2 className="font-display text-2xl font-medium">{title}</h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description ??
              'Connect your live data source and this section will populate automatically. Everything is ready when you are.'}
          </p>
        </div>
      </div>
    </Card>
  );
}
