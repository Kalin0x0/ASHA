import { cn } from '@/lib/utils';

export function ChistaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-7', className)} aria-hidden>
      <defs>
        <linearGradient id="chista-gold" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ecd584" />
          <stop offset="0.55" stopColor="#d4af37" />
          <stop offset="1" stopColor="#8f7129" />
        </linearGradient>
      </defs>
      {/* outer rhombus — the lamp of wisdom */}
      <path
        d="M16 1.5 30.5 16 16 30.5 1.5 16 16 1.5Z"
        stroke="url(#chista-gold)"
        strokeWidth="1.5"
        className="opacity-70"
      />
      {/* inner flame / eye */}
      <path
        d="M16 7c2.6 3.1 5.2 5.6 5.2 9a5.2 5.2 0 1 1-10.4 0c0-3.4 2.6-5.9 5.2-9Z"
        fill="url(#chista-gold)"
      />
      <circle cx="16" cy="17.2" r="2" className="fill-anthracite-900" />
    </svg>
  );
}

export function Logo({
  className,
  collapsed = false,
  showMark = true,
}: {
  className?: string;
  collapsed?: boolean;
  showMark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {showMark && <ChistaMark />}
      {!collapsed && (
        <span className="font-display text-xl font-medium tracking-tight text-foreground">
          Chista
        </span>
      )}
    </span>
  );
}
