'use client';

import { Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The picture on the sign-in screen: three workspaces floating in depth — a
 * Windows desktop, a live session in a browser tab, a Linux terminal. It is
 * what Asha does, drawn instead of described.
 *
 * Pure CSS 3D (the `stage-*` classes in globals.css), no WebGL and no images,
 * so it costs the sign-in route nothing it has to wait for. A fine pointer tilts
 * the rig a few degrees; touch screens and reduced motion get a still picture.
 * Everything in it is decoration and hidden from assistive technology.
 */
export function WorkspaceStage({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // dir="ltr": a drawing of desktops and a terminal, not text to be mirrored.
    <div ref={ref} aria-hidden dir="ltr" className={cn('stage select-none', className)}>
      <div className="stage-rig">
        <div className="stage-drift">
          <div className="stage-floor" />

          {/* Windows desktop, back left */}
          <div className="stage-pane stage-pane--left">
            <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_10%,rgb(var(--brand-rgb)/0.35),transparent_60%),linear-gradient(160deg,var(--color-slate-800),var(--color-slate-950))]" />
            <div className="absolute inset-x-[18%] top-[14%] bottom-[22%] rounded-lg border border-white/10 bg-slate-950/80 p-[6%]">
              <div className="mb-[8%] h-[9%] w-[55%] rounded-full bg-white/15" />
              <div className="grid grid-cols-4 gap-[7%]">
                {Array.from({ length: 12 }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'aspect-square rounded-[4px]',
                      i % 5 === 0 ? 'bg-brand-400/70' : i % 3 === 0 ? 'bg-info-400/50' : 'bg-white/15',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-[11%] items-center justify-center gap-[2.5%] bg-slate-950/85">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={cn('aspect-square h-[55%] rounded-[3px]', i === 0 ? 'bg-info-400/80' : 'bg-white/25')}
                />
              ))}
            </div>
          </div>

          {/* Linux terminal, back right */}
          <div className="stage-pane stage-pane--right">
            <div className="absolute inset-0 bg-slate-950" />
            <div className="relative flex h-[13%] items-center gap-[3%] border-b border-white/10 px-[5%]">
              <span className="size-[7px] rounded-full bg-white/25" />
              <span className="size-[7px] rounded-full bg-white/25" />
              <span className="size-[7px] rounded-full bg-white/25" />
            </div>
            <div className="relative space-y-[3%] px-[6%] pt-[6%] font-mono text-[clamp(6px,0.62vw,10px)] leading-tight text-white/70">
              <p>
                <span className="text-brand-300">dev@build-07</span>:~$ make release
              </p>
              <p className="text-white/45">compiling 214 modules…</p>
              <p className="text-white/45">running tests…</p>
              <p>
                <span className="text-success-400">✓</span> 1 312 passed
              </p>
              <p>
                <span className="text-brand-300">dev@build-07</span>:~$ <span className="stage-caret">▍</span>
              </p>
            </div>
          </div>

          {/* A live session in a browser tab, front and centre */}
          <div className="stage-pane stage-pane--main">
            <div className="relative flex h-[9%] items-center gap-[2%] border-b border-white/10 bg-slate-900/95 px-[3%]">
              <span className="size-[7px] rounded-full bg-white/25" />
              <span className="size-[7px] rounded-full bg-white/25" />
              <span className="size-[7px] rounded-full bg-white/25" />
              <div className="mx-auto flex h-[62%] w-[46%] items-center justify-center gap-[4%] rounded-full bg-white/[0.07] text-[clamp(6px,0.6vw,10px)] text-white/55">
                <Lock className="size-[1em]" />
                asha / workspace
              </div>
            </div>
            <div className="relative h-[91%] overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(90%_80%_at_75%_20%,rgb(var(--brand-rgb)/0.45),transparent_60%),radial-gradient(70%_70%_at_10%_100%,rgb(var(--brand-rgb)/0.2),transparent_70%),linear-gradient(150deg,var(--color-slate-850),var(--color-slate-950))]" />

              {/* a window with a chart */}
              <div className="absolute left-[6%] top-[9%] h-[56%] w-[54%] rounded-md border border-white/10 bg-slate-950/90 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.7)]">
                <div className="flex h-[14%] items-center gap-[3%] border-b border-white/10 px-[4%]">
                  <span className="h-[30%] w-[30%] rounded-full bg-white/20" />
                </div>
                <div className="flex h-[86%] items-end gap-[4%] px-[7%] pb-[9%] pt-[8%]">
                  {[38, 62, 45, 80, 58, 92, 70].map((h, i) => (
                    <span
                      key={i}
                      className="stage-bar flex-1 rounded-t-[3px] bg-gradient-to-t from-brand-600/70 to-brand-300"
                      style={{ height: `${h}%`, animationDelay: `${i * 0.35}s` }}
                    />
                  ))}
                </div>
              </div>

              {/* a second window: a file list */}
              <div className="absolute right-[6%] top-[22%] h-[50%] w-[32%] rounded-md border border-white/10 bg-slate-950/85 p-[4%]">
                {[70, 52, 84, 46, 64].map((w, i) => (
                  <div key={i} className="mb-[10%] flex items-center gap-[8%]">
                    <span className="aspect-square h-[0.55rem] rounded-[2px] bg-info-400/60" />
                    <span className="h-[0.3rem] rounded-full bg-white/20" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>

              {/* LIVE badge */}
              <div className="absolute right-[4%] top-[5%] flex items-center gap-[0.35em] rounded-full border border-success-400/40 bg-success-400/15 px-[0.6em] py-[0.25em] text-[clamp(6px,0.6vw,10px)] font-semibold tracking-wider text-success-400">
                <span className="stage-live size-[0.55em] rounded-full bg-success-400" />
                LIVE
              </div>

              {/* taskbar */}
              <div className="absolute inset-x-0 bottom-0 flex h-[11%] items-center justify-center gap-[1.6%] bg-slate-950/85">
                {Array.from({ length: 7 }, (_, i) => (
                  <span
                    key={i}
                    className={cn('aspect-square h-[52%] rounded-[3px]', i === 3 ? 'bg-brand-400' : 'bg-white/20')}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* protocol chips floating in front */}
          <span className="stage-chip stage-chip--a">RDP</span>
          <span className="stage-chip stage-chip--b">SSH</span>
          <span className="stage-chip stage-chip--c">VNC</span>
        </div>
      </div>
    </div>
  );
}
