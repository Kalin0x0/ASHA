'use client';

import { Users as UsersIcon, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useUsers } from '@/lib/hooks';

export default function GroupsPage() {
  const users = useUsers();

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) for (const g of u.groups) map.set(g, (map.get(g) ?? 0) + 1);
    return [...map.entries()]
      .map(([name, members]) => ({ name, members }))
      .sort((a, b) => b.members - a.members);
  }, [users]);

  const assignments = users.reduce((s, u) => s + u.groups.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Membership groups, derived from current user assignments — used to scope workspace access and roles."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Groups" value={groups.length} icon={UsersRound} primary />
        <StatCard label="Memberships" value={assignments} icon={UsersIcon} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.name} elevation={1}>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-gold-500/10 text-gold-300">
                  <UsersRound className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.members} member{g.members === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="tnum">
                {g.members}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {groups.length === 0 && (
          <div className="col-span-full">
            <EmptyState icon={UsersRound} title="No groups yet" description="Groups are derived from user memberships. Add users and assign them to groups." />
          </div>
        )}
      </div>
    </div>
  );
}
