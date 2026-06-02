import { cn, initials } from '@/lib/utils';

const GRADIENTS = [
  'from-[#d4af37] to-[#8f7129]',
  'from-[#6a8fc4] to-[#3a4f73]',
  'from-[#5fb88f] to-[#356b52]',
  'from-[#b07fc4] to-[#5e4470]',
  'from-[#e0a84a] to-[#8a632a]',
  'from-[#c4708f] to-[#6e3f50]',
  'from-[#7c83d4] to-[#42477a]',
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Monogram({
  name,
  className,
  rounded = 'rounded-lg',
}: {
  name: string;
  className?: string;
  rounded?: string;
}) {
  const gradient = GRADIENTS[hash(name) % GRADIENTS.length];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-gradient-to-br font-display text-sm font-semibold text-anthracite-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]',
        gradient,
        rounded,
        'size-10',
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
