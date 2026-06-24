import { LanguageSwitcher } from '@/components/composite/language-switcher';

/**
 * Auth shell — a full-bleed canvas. The sign-in screen owns its own layout (the
 * cinematic split-screen: showcase panel + sign-in panel), so this stays a thin
 * wrapper with just the pre-sign-in language picker on top.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute end-4 top-4 z-30">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
