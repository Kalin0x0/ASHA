import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-md bg-gradient-to-r from-anthracite-700 via-anthracite-600 to-anthracite-700',
        className,
      )}
      {...props}
    />
  );
}
