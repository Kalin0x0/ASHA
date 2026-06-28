'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

export interface ConfirmOptions {
  /** Dialog heading. Defaults to a generic "Are you sure?". */
  title?: string;
  /** Body copy — name the thing being removed and any side effects. */
  description?: string;
  /** Primary button label. Defaults to "Delete". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Destructive (red) styling. Defaults to true — this primitive exists to gate deletes. */
  destructive?: boolean;
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative confirmation gate. Call `await confirm({ ... })` at the top of any
 * destructive handler and bail when it resolves false:
 *
 *   const confirm = useConfirm();
 *   const onDelete = async (id: string) => {
 *     if (!(await confirm({ description: t('confirmRemove', { name }) }))) return;
 *     await remove(id);
 *   };
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

/**
 * Mounts a single shared confirmation dialog and exposes `useConfirm()` to the
 * whole tree. One dialog instance handles every destructive action so the look,
 * keyboard handling (Esc = cancel, focus-trapped) and a11y stay consistent.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common.confirm');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts ?? {});
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const destructive = options.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : settle(false))}>
        <DialogContent className="max-w-sm" hideClose>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className={destructive ? 'size-5 text-destructive' : 'size-5 text-gold-300'} />
              {options.title ?? t('title')}
            </DialogTitle>
            <DialogDescription>{options.description ?? t('description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {/* Cancel is first in the DOM, so Radix focuses it by default — the
                safe default for an irreversible action. */}
            <Button variant="ghost" size="sm" onClick={() => settle(false)}>
              {options.cancelLabel ?? t('cancel')}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              size="sm"
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
