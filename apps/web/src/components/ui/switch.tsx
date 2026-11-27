'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * An on/off switch. Deliberately not a checkbox: a checkbox reads as "selected,
 * pending a Save", while a switch reads as "this is the state right now" — which
 * is what an access toggle actually is, since it saves the moment you flip it.
 *
 * Under `dir="rtl"` the flex row already starts on the right, so the thumb rests
 * there and travels left: the translate is negated, nothing is mirrored. (The
 * old `rtl:-scale-x-100` flipped the row a second time, and an off switch in
 * Persian sat where "on" belongs.)
 *
 * The visible track is 38×22; an invisible ::after extends the hit area to 44px.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ring-gold-focus',
      "after:absolute after:-inset-x-1.5 after:-inset-y-[11px] after:content-['']",
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-[18px] translate-x-0.5 rounded-full bg-white shadow-sm transition-transform rtl:-translate-x-0.5',
        'data-[state=checked]:translate-x-[17px] rtl:data-[state=checked]:-translate-x-[17px]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
