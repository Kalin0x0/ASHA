'use client';

import { Plus, RefreshCw, Rocket, Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CHANGELOG, CURRENT_VERSION, type ChangeType, localize, type Release } from '@/lib/changelog';
import { isNewer } from '@/lib/update-check';
import { cn } from '@/lib/utils';

/**
 * The version the viewer last acknowledged, per browser. Absent means either a
 * brand-new visitor or storage they cannot read — both of which get no popup,
 * only a silent record of where they came in, so nobody is shown "what's new"
 * for an app they are seeing for the first time.
 */
const SEEN_KEY = 'asha-last-seen-version';

const TYPE_META: Record<ChangeType, { icon: typeof Plus; dot: string; text: string }> = {
  added: { icon: Plus, dot: 'bg-success', text: 'text-success' },
  fixed: { icon: Wrench, dot: 'bg-warning', text: 'text-warning' },
  changed: { icon: RefreshCw, dot: 'bg-info', text: 'text-info' },
};
const TYPE_ORDER: ChangeType[] = ['added', 'fixed', 'changed'];

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Private mode or blocked storage: nothing to persist, and the read side
    // treats "cannot read" as a first visit, so this simply shows no popup
    // rather than the same one on every load.
  }
}

/**
 * After a deploy, tells every returning user that the app was updated and what
 * changed — once per new version, from the changelog baked into this build. It
 * is the "what changed" half of the update flow; the service worker's reload
 * toast (pwa-context) is the "a new version is ready" half, and it cannot carry
 * the notes because the notes only exist in the build being offered.
 *
 * Version-driven, not time-driven: a returning user is shown every release newer
 * than the one they last acknowledged (they may have skipped a few), and
 * dismissing records the current one so it never repeats until the next update.
 */
export function WhatsNewPopup() {
  const t = useTranslations('pwa.whatsNew');
  const tTypes = useTranslations('developer.updates.types');
  const locale = useLocale();
  const [releases, setReleases] = useState<Release[] | null>(null);

  useEffect(() => {
    const seen = readSeen();
    // First time on this browser: record where they came in, show nothing.
    if (!seen) {
      writeSeen(CURRENT_VERSION);
      return;
    }
    // Already caught up. isNewer is false for equal versions, so re-runs are quiet.
    if (!isNewer(CURRENT_VERSION, seen)) return;
    // Everything released since they last looked, newest first (CHANGELOG is).
    const since = CHANGELOG.filter((r) => isNewer(r.version, seen));
    if (since.length === 0) {
      writeSeen(CURRENT_VERSION);
      return;
    }
    setReleases(since);
  }, []);

  const dismiss = () => {
    writeSeen(CURRENT_VERSION);
    setReleases(null);
  };

  useEffect(() => {
    if (!releases) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releases]);

  if (!releases) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      className="fixed inset-0 z-modal grid place-items-center bg-anthracite-950/80 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border-subtle bg-[var(--surface-1)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-500/10 text-gold-300">
            <Rocket className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="whats-new-title" className="font-display text-lg font-medium">
              {t('title')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('subtitle', { version: CURRENT_VERSION })}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {releases.map((release) => {
            const grouped = TYPE_ORDER.map((type) => ({ type, items: release.changes.filter((c) => c.type === type) })).filter(
              (g) => g.items.length > 0,
            );
            return (
              <div key={release.version}>
                {releases.length > 1 && (
                  <p className="mb-2 text-xs font-semibold text-gold-300" dir="ltr">
                    v{release.version}
                  </p>
                )}
                <div className="space-y-3">
                  {grouped.map(({ type, items }) => {
                    const meta = TYPE_META[type];
                    const Icon = meta.icon;
                    return (
                      <div key={type}>
                        <div className="mb-1.5 flex items-center gap-2">
                          <Icon className={cn('size-3.5', meta.text)} />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {tTypes(type)}
                          </span>
                        </div>
                        <ul className="space-y-1.5 ps-1">
                          {items.map((item, i) => (
                            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
                              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', meta.dot)} />
                              <span>{localize(item.text, locale)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-border-subtle p-4">
          <Button size="sm" autoFocus onClick={dismiss}>
            {t('dismiss')}
          </Button>
        </div>
      </div>
    </div>
  );
}
