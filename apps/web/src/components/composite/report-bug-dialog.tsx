'use client';

import { Bug, Send } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useSubmitBug } from '@/lib/hooks';
import type { BugSeverity } from '@/lib/types';

const SEVERITIES: BugSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * The user-facing "Report a bug" entry point. Captures a title, description and
 * severity, auto-attaches the current route, and posts to the central intake
 * (live API or mock store). Mounted in the topbar.
 */
export function ReportBugDialog() {
  const t = useTranslations('support.report');
  const tSeverity = useTranslations('support.severity');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const submit = useSubmitBug();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('MEDIUM');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setSeverity('MEDIUM');
  };

  const onSubmit = async () => {
    if (title.trim().length < 3 || description.trim().length < 1) return;
    setBusy(true);
    try {
      await submit({ title: title.trim(), description: description.trim(), severity, route: pathname });
      toast.success(t('success'), { description: t('successDescription') });
      reset();
      setOpen(false);
    } catch {
      toast.error(t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('trigger')}>
          <Bug className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="bug-title">{t('fields.title')}</Label>
            <Input
              id="bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('fields.titlePlaceholder')}
              maxLength={240}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-description">{t('fields.description')}</Label>
            <textarea
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('fields.descriptionPlaceholder')}
              rows={5}
              className="flex w-full resize-y rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 text-sm transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bug-severity">{t('fields.severity')}</Label>
            <select
              id="bug-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as BugSeverity)}
              className="flex h-9.5 w-full rounded-md border border-input bg-[var(--surface-1)] px-3 text-sm focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {tSeverity(s)}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground/70">{t('routeNote', { route: pathname })}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {tc('actions.cancel')}
          </Button>
          <Button onClick={onSubmit} loading={busy} disabled={title.trim().length < 3 || !description.trim()}>
            <Send className="size-4" /> {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
