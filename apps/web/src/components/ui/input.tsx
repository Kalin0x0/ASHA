import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9.5 w-full rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 text-sm transition-shadow',
        'placeholder:text-muted-foreground/70',
        'focus-visible:outline-none focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-xs font-medium tracking-wide text-muted-foreground', className)}
    {...props}
  />
));
Label.displayName = 'Label';
