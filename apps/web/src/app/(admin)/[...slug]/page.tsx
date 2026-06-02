import { Boxes } from 'lucide-react';
import { ComingSoon } from '@/components/composite/coming-soon';
import { findNavItem } from '@/lib/nav';

export default async function CatchAllAdminPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const pathname = '/' + (slug?.join('/') ?? '');
  const match = findNavItem(pathname);
  const item = match?.item;

  return (
    <div className="space-y-6">
      <ComingSoon
        title={item?.label ?? 'Module'}
        section={match?.group.label}
        icon={item?.icon ?? Boxes}
        phase={item?.phase ?? 2}
      />
    </div>
  );
}
