'use client';

import { Eye, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAccount, useAcknowledgeObservation } from '@/lib/hooks';

/**
 * The one-time live-observation disclosure, shown once per user under the org's
 * acknowledgement mode. Accepting it is what lets the per-session banner be
 * dropped for that user afterwards — so it is a genuine notice, not a formality:
 * it names what can happen, it blocks the app until answered, and the server
 * records the acceptance in the audit trail. A user who never sees or accepts it
 * keeps the live banner, which is why this gate must actually stand in the way
 * rather than being dismissible.
 *
 * `required` comes from the API (`/account`), true only in `ack` mode and only
 * until the current version is accepted. In `live` mode it is never required and
 * this renders nothing.
 */
export function ObservationDisclosureGate() {
  const t = useTranslations('common');
  const account = useAccount();
  const acknowledge = useAcknowledgeObservation();
  const [busy, setBusy] = useState(false);

  const disclosure = account?.observationDisclosure;
  if (!disclosure?.required) return null;

  const onAccept = async () => {
    setBusy(true);
    try {
      await acknowledge(disclosure.version);
    } finally {
      // On success the account refetch flips `required` to false and this
      // unmounts; on failure the button frees so the user can try again.
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="observation-disclosure-title"
      aria-describedby="observation-disclosure-body"
      className="fixed inset-0 z-modal grid place-items-center bg-anthracite-950/85 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
    >
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-[var(--surface-1)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-500/10 text-gold-300">
            <Eye className="size-5" />
          </span>
          <h2 id="observation-disclosure-title" className="font-display text-lg font-medium">
            {t('observationDisclosure.title')}
          </h2>
        </div>
        <div id="observation-disclosure-body" className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{t('observationDisclosure.body')}</p>
          <p>{t('observationDisclosure.detail')}</p>
        </div>
        <div className="mt-6 flex justify-end">
          <Button size="sm" autoFocus onClick={() => void onAccept()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t('observationDisclosure.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
