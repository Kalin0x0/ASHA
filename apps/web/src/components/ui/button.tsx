'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ring-gold-focus',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground font-semibold shadow-[0_1px_2px_rgba(0,0,0,.4),inset_0_1px_0_rgba(255,255,255,.22)] hover:brightness-[1.07] hover:-translate-y-px hover:shadow-[var(--gold-glow),0_8px_20px_-8px_rgba(212,175,55,.55)] active:translate-y-0 active:brightness-95',
        secondary:
          'bg-secondary text-secondary-foreground border border-border-subtle hover:bg-surface-3 hover:border-border',
        outline:
          'border border-[rgba(212,175,55,0.4)] text-gold-300 bg-transparent hover:bg-[rgba(212,175,55,0.08)] hover:border-gold-500',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground font-semibold hover:brightness-110 active:brightness-95',
        link: 'text-gold-300 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9.5 px-4',
        lg: 'h-11 px-6 text-base',
        icon: 'size-9.5',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
