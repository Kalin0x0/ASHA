import { Monogram } from '@/components/composite/monogram';
import { resolveAppIcon } from '@/lib/app-icons';
import { cn } from '@/lib/utils';

/**
 * App identity tile for the launcher. Priority:
 *  1. a custom `iconUrl` (admin-provided),
 *  2. a matched brand logo (Firefox, Windows, Ubuntu, …),
 *  3. the initials monogram (fallback).
 *
 * The logo is a real colour SVG/image rendered on a light tile (so any logo —
 * light or dark — stays visible on the dark card hero). `className` controls
 * size + rounding (e.g. "size-16 rounded-2xl").
 */
export function AppIcon({
  name,
  dockerImage,
  category,
  iconUrl,
  className,
  rounded = 'rounded-2xl',
}: {
  name: string;
  dockerImage?: string;
  category?: string;
  iconUrl?: string;
  className?: string;
  rounded?: string;
}) {
  const resolved = resolveAppIcon(name, dockerImage, category);
  const src = iconUrl?.trim() || resolved?.src;

  if (!src) return <Monogram name={name} className={className} rounded={rounded} />;

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_24px_-8px_rgba(0,0,0,0.55)]',
        rounded,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden className="size-[62%] object-contain" />
    </span>
  );
}
