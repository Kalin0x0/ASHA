import { AuroraBackground, GrainOverlay } from '@/components/decor/aurora-background';
import { ChistaMark } from '@/components/brand/logo';
import { LanguageSwitcher } from '@/components/composite/language-switcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <AuroraBackground />
      <GrainOverlay />

      {/* Language picker, available before sign-in */}
      <div className="absolute right-4 top-4 z-20">
        <LanguageSwitcher />
      </div>

      {/* Floating orbs for depth */}
      <div className="pointer-events-none absolute left-[15%] top-[20%] size-64 rounded-full bg-gold-500/6 blur-[100px] animate-float" aria-hidden />
      <div className="pointer-events-none absolute right-[10%] bottom-[25%] size-80 rounded-full bg-info-500/6 blur-[120px] animate-float delay-300" aria-hidden />

      {/* Brand watermark */}
      <ChistaMark className="pointer-events-none absolute bottom-8 right-8 size-36 opacity-[0.035]" />

      <div className="relative z-10 w-full max-w-[420px]">{children}</div>
    </div>
  );
}
