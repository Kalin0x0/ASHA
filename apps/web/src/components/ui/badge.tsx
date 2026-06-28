import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-border-subtle bg-secondary text-secondary-foreground',
        gold: 'border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.1)] text-gold-300',
        success: 'border-[rgba(95,184,143,0.3)] bg-[rgba(95,184,143,0.1)] text-success',
        warning: 'border-[rgba(224,168,74,0.3)] bg-[rgba(224,168,74,0.1)] text-warning',
        destructive: 'border-[rgba(210,104,95,0.3)] bg-[rgba(210,104,95,0.1)] text-destructive',
        info: 'border-[rgba(106,143,196,0.3)] bg-[rgba(106,143,196,0.1)] text-info',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
