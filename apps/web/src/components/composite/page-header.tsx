import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    // Actions align with the title, not with the last line of a long description.
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
