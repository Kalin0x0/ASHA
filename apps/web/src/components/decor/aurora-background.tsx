import { cn } from '@/lib/utils';

export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden bg-aurora', className)} aria-hidden>
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute -left-32 top-1/4 size-96 rounded-full bg-gold-500/10 blur-[120px]" />
      <div className="absolute -right-24 top-1/3 size-80 rounded-full bg-info-500/10 blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 size-96 rounded-full bg-gold-500/[0.07] blur-[140px]" />
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,transparent_40%,rgba(14,14,26,0.7)_100%)]" />
    </div>
  );
}

export function GrainOverlay() {
  return <div className="grain" aria-hidden />;
}
