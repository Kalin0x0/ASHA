'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { KEYSYMS } from '@/lib/touch-keyboard';
import { cn } from '@/lib/utils';

/**
 * The keys a phone keyboard does not have.
 *
 * Soft keyboards give you letters and little else, so Esc, Tab, the arrows and
 * every modifier combination are unreachable on a touch device. This bar sits
 * directly above the soft keyboard and holds the modifiers as "sticky": tap
 * Ctrl, then tap C, and the desktop receives Ctrl+C with the modifier released
 * afterwards, the way phone keyboards handle Shift.
 */

const MODIFIERS = [
  { keysym: KEYSYMS.CTRL, label: 'Ctrl' },
  { keysym: KEYSYMS.ALT, label: 'Alt' },
  { keysym: KEYSYMS.SHIFT, label: 'Shift' },
  { keysym: KEYSYMS.SUPER, label: 'Win' },
] as const;

const ARROWS = [
  { keysym: KEYSYMS.LEFT, icon: ArrowLeft, label: 'Left' },
  { keysym: KEYSYMS.UP, icon: ArrowUp, label: 'Up' },
  { keysym: KEYSYMS.DOWN, icon: ArrowDown, label: 'Down' },
  { keysym: KEYSYMS.RIGHT, icon: ArrowRight, label: 'Right' },
] as const;

function Key({
  children,
  onPress,
  active,
  wide,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  active?: boolean;
  wide?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // The bar must never steal focus from the sink, or the soft keyboard
      // closes the instant a modifier is tapped.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => {
        e.preventDefault();
        onPress();
      }}
      onClick={onPress}
      className={cn(
        'inline-flex h-11 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors ring-gold-focus',
        wide && 'px-4',
        active
          ? 'border-[rgba(212,175,55,0.45)] bg-gold-500/20 text-gold-200'
          : 'border-border-subtle bg-anthracite-900/80 text-muted-foreground active:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

export function TouchKeyBar({
  press,
  release,
  onCtrlAltDel,
  onHide,
}: {
  press: (keysym: number) => void;
  release: (keysym: number) => void;
  onCtrlAltDel: () => void;
  onHide: () => void;
}) {
  const t = useTranslations('viewer');
  const [sticky, setSticky] = useState<number[]>([]);

  const toggleModifier = useCallback(
    (keysym: number) => {
      if (sticky.includes(keysym)) {
        release(keysym);
        setSticky(sticky.filter((k) => k !== keysym));
      } else {
        press(keysym);
        setSticky([...sticky, keysym]);
      }
    },
    [press, release, sticky],
  );

  /** Tap a normal key, wrapped in whatever modifiers are currently held. */
  const tapWithModifiers = useCallback(
    (keysym: number) => {
      press(keysym);
      release(keysym);
      if (sticky.length === 0) return;
      sticky.forEach(release);
      setSticky([]);
    },
    [press, release, sticky],
  );

  return (
    <div
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-border-subtle bg-[var(--surface-1)] px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <Key label={t('connect.touch.hideKeyboard')} onPress={onHide}>
        <ChevronDown className="size-4" />
      </Key>
      <span aria-hidden className="h-6 w-px shrink-0 bg-border-subtle" />
      <Key label="Escape" onPress={() => tapWithModifiers(KEYSYMS.ESCAPE)}>
        Esc
      </Key>
      <Key label="Tab" onPress={() => tapWithModifiers(KEYSYMS.TAB)}>
        Tab
      </Key>
      {MODIFIERS.map((m) => (
        <Key
          key={m.label}
          label={m.label}
          active={sticky.includes(m.keysym)}
          onPress={() => toggleModifier(m.keysym)}
        >
          {m.label}
        </Key>
      ))}
      {ARROWS.map((a) => (
        <Key key={a.label} label={a.label} onPress={() => tapWithModifiers(a.keysym)}>
          <a.icon className="size-4" />
        </Key>
      ))}
      <Key label="Delete" onPress={() => tapWithModifiers(KEYSYMS.DELETE)}>
        Del
      </Key>
      <Key label={t('connect.toolbar.ctrlAltDel')} wide onPress={onCtrlAltDel}>
        Ctrl+Alt+Del
      </Key>
    </div>
  );
}
