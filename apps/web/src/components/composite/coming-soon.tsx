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
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.18]" />
      <div className="relative flex flex-col items-center gap-6 px-6 py-24 text-center">
        <div className="relative flex items-end justify-center">
          <Image
            src="/chista-logo.svg"
            alt=""
            width={56}
            height={56}
            unoptimized
            className="opacity-30"
          />
          <span className="absolute -bottom-2 -right-2 flex size-10 items-center justify-center rounded-xl border border-[rgba(212,175,55,0.25)] bg-gold-500/10 text-gold-300 ring-1 ring-inset ring-white/5">
            <Icon className="size-5" />
          </span>
        </div>

        <div className="space-y-2">
          {section && (
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
              {section}
            </span>
          )}
          <h2 className="font-display text-2xl font-medium">{title}</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {description ??
              'This feature is part of your Chista deployment and ready to use — connect your live data source and everything will appear here automatically.'}
          </p>
        </div>
      </div>
    </Card>
  );
}
