import { Monogram } from '@/components/composite/monogram';
import { resolveAppIcon } from '@/lib/app-icons';
import { cn } from '@/lib/utils';

/**
 * App identity tile for the launcher. Priority:
 *  1. a custom `iconUrl` (uploaded / pasted by an admin) → shown as-is,
 *  2. a matched brand glyph (Firefox, Windows, Ubuntu, …) → white on a
 *     brand-coloured tile (CSS mask),
 *  3. the initials monogram (fallback).
 *
 * `className` controls size + rounding (e.g. "size-16 rounded-2xl").
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
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        className={cn('object-contain', rounded, className)}
      />
    );
  }

  const icon = resolveAppIcon(name, dockerImage, category);
  if (!icon) return <Monogram name={name} className={className} rounded={rounded} />;

  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center', rounded, className)}
      style={{ backgroundColor: icon.color }}
    >
      <span
        className="block size-[56%]"
        style={{
          backgroundColor: '#fff',
          WebkitMaskImage: `url('${icon.src}')`,
          maskImage: `url('${icon.src}')`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    </span>
  );
}
