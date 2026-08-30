'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * An on/off switch. Deliberately not a checkbox: a checkbox reads as "selected,
 * pending a Save", while a switch reads as "this is the state right now" — which
 * is what an access toggle actually is, since it saves the moment you flip it.
 *
 * The track is mirrored under `dir="rtl"` so the thumb's physical `translate-x`
 * still reads as "travels toward the end of the row". Flipping the thumb alone
 * would not help — it is a circle; it is the direction of travel that is wrong.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ring-gold-focus rtl:-scale-x-100',
      'data-[state=checked]:bg-gold-500 data-[state=unchecked]:bg-anthracite-600',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-[18px] translate-x-0.5 rounded-full bg-white shadow-sm transition-transform',
        'data-[state=checked]:translate-x-[17px]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
