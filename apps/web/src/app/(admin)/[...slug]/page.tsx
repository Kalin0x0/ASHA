import { Boxes } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
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
  const tNav = await getTranslations('shell.nav');
  const tShell = await getTranslations('shell.comingSoon');

  return (
    <div className="space-y-6">
      <ComingSoon
        title={match ? tNav(`items.${match.item.key}`) : tShell('module')}
        section={match ? tNav(`groups.${match.group.key}`) : undefined}
        icon={match?.item.icon ?? Boxes}
      />
    </div>
  );
}
