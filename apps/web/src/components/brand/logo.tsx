import Image from 'next/image';
import { cn } from '@/lib/utils';

export function AshaMark({ className }: { className?: string }) {
  return (
    <Image
      src="/asha-logo.svg"
      alt="Asha"
      width={32}
      height={32}
      priority
      unoptimized
      className={cn('size-7 rounded-lg', className)}
    />
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
      {showMark && <AshaMark />}
      {!collapsed && (
        <span className="font-display text-xl font-medium tracking-tight text-foreground">
          Asha
        </span>
      )}
    </span>
  );
}
