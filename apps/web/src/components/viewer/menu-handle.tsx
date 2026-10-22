'use client';

import { ChevronDown, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The pull-tab that brings a hidden viewer menu back.
 *
 * It hangs from the top centre, where remote-desktop clients have taught people
 * to look for the connection bar, and stays small and dim so the desktop under
 * it remains the thing on screen. Only the tab takes input: the row it sits in
 * is click-through, so the rest of the desktop's top edge still belongs to the
 * desktop. So does the tab itself while a press that began on the desktop is
 * held (an ancestor carries `data-pressing`): a window dragged to the top centre
 * — Windows 11 snap layouts live there — must not lose the drag to it.
 *
 * Render it after the stage and BEFORE the observation and control notices. It
 * shares their z-50, so DOM order is what keeps a notice on top of it: while
 * somebody is watching, saying so outranks reaching the menu.
 */
export function MenuHandle({
  onShow,
  keepFocus = false,
  viewOnly,
}: {
  onShow: (viaKeyboard: boolean) => void;
  /** Leave focus where it is on a click. The guacd viewer needs it: its paste
   *  sink (and a phone's open soft keyboard) must not lose focus to a button
   *  that unmounts on this very click. The KasmVNC viewer wants the opposite,
   *  so that the next click into the frame blurs this window and can fold the
   *  floating bar away again. */
  keepFocus?: boolean;
  /** Set while only watching: the toolbar's "View only" badge would otherwise
   *  leave the screen with the toolbar, and nothing would explain why the
   *  desktop ignores every key. */
  viewOnly?: string;
}) {
  const t = useTranslations('viewer');
  const label = viewOnly ? `${viewOnly} · ${t('menu.show')}` : t('menu.show');
  return (
    <div
      // on-dark: the tab hangs over the desktop, never over the page, so the
      // light theme must not recolour it dark-on-dark.
      className="on-dark pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <button
        type="button"
        id="viewer-menu-handle"
        aria-controls="viewer-menu"
        aria-expanded={false}
        aria-label={label}
        title={label}
        onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
        // detail is 0 for Enter and Space: only then does focus follow into the bar.
        onClick={(e) => onShow(e.detail === 0)}
        className="group pointer-events-auto flex h-11 min-w-11 items-start justify-center rounded-b-lg ring-gold-focus [[data-pressing]_&]:pointer-events-none"
      >
        <span
          data-cue={viewOnly ? '' : undefined}
          className="flex h-5 min-w-10 items-center justify-center gap-1.5 rounded-b-lg border border-t-0 border-gold-500/35 bg-anthracite-900/80 px-2 text-gold-300 opacity-80 data-[cue]:bg-anthracite-900 data-[cue]:opacity-100 shadow-[var(--shadow-lifted)] backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100"
        >
          {viewOnly && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-info-400)]">
              <Eye className="size-3" aria-hidden /> {viewOnly}
            </span>
          )}
          <ChevronDown className="size-3.5" aria-hidden />
        </span>
      </button>
    </div>
  );
}
