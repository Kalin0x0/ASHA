import * as React from 'react';
import { cn } from '@/lib/utils';

type Elevation = 0 | 1 | 2 | 'gold' | 'glass';

const elevClass: Record<string, string> = {
  '0': 'elev-0',
  '1': 'elev-1',
  '2': 'elev-2',
  gold: 'elev-1 elev-gold',
  glass: 'glass-card',
};

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { elevation?: Elevation; interactive?: boolean }
>(({ className, elevation = 1, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-lg text-card-foreground transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
      elevClass[String(elevation)],
      interactive &&
        'gold-hairline cursor-pointer hover:-translate-y-1 hover:border-[rgba(212,175,55,0.4)] hover:shadow-[var(--shadow-lifted),0_0_0_1px_rgba(212,175,55,0.1)]',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1 p-5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold leading-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-3 p-5 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
