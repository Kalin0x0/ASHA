import { AshaMark } from '@/components/brand/logo';
import { WorkspaceStage } from '@/components/auth/workspace-stage';

/**
 * The half of the sign-in and request-access screens that says what Asha is:
 * the 3D stage, an eyebrow, a headline and whatever the page lists below it
 * (features on sign-in, the three steps on request-access).
 *
 * Beside the form on wide screens, below it on narrow ones (`order-2`): the
 * form comes first, the pitch is there for whoever scrolls.
 */
export function AuthShowcase({
  id,
  eyebrow,
  headline,
  lead,
  footer,
  children,
}: {
  /** id of the headline, for the section's aria-labelledby. */
  id: string;
  eyebrow: string;
  headline: React.ReactNode;
  lead?: string;
  footer: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="on-dark relative order-2 flex flex-col overflow-hidden px-6 py-14 sm:px-10 lg:order-1 lg:justify-between lg:px-14 lg:py-10"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 55% at 70% 30%, rgb(var(--brand-rgb)/0.18), transparent 65%), radial-gradient(60% 50% at 0% 100%, rgb(var(--brand-rgb)/0.10), transparent 70%), linear-gradient(160deg, var(--color-slate-900), var(--color-slate-950) 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 end-0 hidden w-px lg:block"
        style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--brand-rgb)/0.45), transparent)' }}
      />

      <div className="relative hidden items-center gap-3 lg:flex">
        <AshaMark className="size-11 rounded-xl shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]" />
        <span className="font-display text-xl font-semibold tracking-[0.08em] text-white">ASHA</span>
      </div>

      {/* Sized by the viewport's height too, so on a laptop the pitch below
          still fits beside the form without scrolling. */}
      <div className="relative mx-auto w-[88%] max-w-[640px] sm:w-full lg:my-2">
        <WorkspaceStage className="mx-auto w-[min(100%,560px,calc(38dvh*16/11))]" />
      </div>

      <div className="relative mx-auto w-full max-w-[640px]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">{eyebrow}</p>
        <h2
          id={id}
          className="mt-3 font-display text-[clamp(1.75rem,3vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance"
        >
          {headline}
        </h2>
        {lead && <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-white/75">{lead}</p>}
        {children}
        <p className="mt-6 text-xs text-white/50">{footer}</p>
      </div>
    </section>
  );
}
