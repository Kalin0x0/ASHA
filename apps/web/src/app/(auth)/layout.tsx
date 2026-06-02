import { AuroraBackground } from '@/components/decor/aurora-background';
import { ChistaMark } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <AuroraBackground />
      {/* faint brand watermark */}
      <ChistaMark className="pointer-events-none absolute bottom-8 right-8 size-40 opacity-[0.04]" />
      <div className="relative z-10 w-full max-w-md animate-rise">{children}</div>
    </div>
  );
}
