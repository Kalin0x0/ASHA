'use client';

import { AppWindow, Check, Info, Loader2, Search, Users as UsersIcon, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { EmptyState } from '@/components/composite/empty-state';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useGroups,
  useIsolationDenyByDefault,
  useSetWorkspaceGroupAccess,
  useSetWorkspaceUserAccess,
  useUsers,
  useWorkspaces,
} from '@/lib/hooks';
import type { UserRow, Workspace, WorkspaceType } from '@/lib/types';
import { WORKSPACE_ACCESS_RANK, WORKSPACE_TYPE_ORDER, workspaceAccessFor } from '@/lib/workspace-access';
import { cn } from '@/lib/utils';


/** A row in the left-hand picker — a person or a workspace, depending on the axis. */
interface Subject {
  id: string;
  title: string;
  subtitle: string;
  /** Present only on the workspace axis, so the row can show the real app icon. */
  ws?: Workspace;
}

export default function AssignmentsPage() {
  // useSearchParams needs a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={null}>
      <Assignments />
    </Suspense>
  );
}

function Assignments() {
  const t = useTranslations('access.assignments');
  const params = useSearchParams();
  const users = useUsers();
  const workspaces = useWorkspaces();
  const groups = useGroups();
  const setUserAccess = useSetWorkspaceUserAccess();
  const setGroupAccess = useSetWorkspaceGroupAccess();

  const [mode, setMode] = useState<'person' | 'workspace'>(
    params.get('workspace') ? 'workspace' : 'person',
  );
  const [subjectId, setSubjectId] = useState<string | null>(
    params.get('user') ?? params.get('workspace'),
  );
  const [subjectQuery, setSubjectQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  // Ids currently in flight, so a row can show a spinner and refuse a second click.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  // Read the real org setting rather than assuming: with the open model in
  // effect, an ungranted workspace is visible to EVERYONE, and labelling it
  // "nobody has this" would be exactly backwards.
  const denyByDefault = useIsolationDenyByDefault();

  const subjects = useMemo<Subject[]>(() => {
    const q = subjectQuery.trim().toLowerCase();
    if (mode === 'person') {
      return users
        .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .map((u) => ({ id: u.id, title: u.name, subtitle: u.email }));
    }
    return workspaces
      .filter((w) => !q || w.friendlyName.toLowerCase().includes(q))
      .map((w) => ({
        id: w.id,
        // Lead with the kind: "Service" or "Docker" is what tells two similarly
        // named entries apart, and the image tag rarely fits anyway.
        title: w.friendlyName,
        subtitle: [t(`types.${w.type}`), w.dockerImage || w.category].filter(Boolean).join(' · '),
        ws: w,
      }));
  }, [mode, users, workspaces, subjectQuery, t]);

  // Keep a valid selection: switching axis (or filtering the current pick away)
  // must not leave the right-hand pane rendering nothing with no explanation.
  const selected = subjects.find((s) => s.id === subjectId) ?? subjects[0];
  useEffect(() => {
    if (selected && selected.id !== subjectId) setSubjectId(selected.id);
  }, [selected, subjectId]);

  const run = async (key: string, action: () => Promise<unknown>, grantedNow: boolean) => {
    setBusy((b) => new Set(b).add(key));
    try {
      await action();
      toast.success(grantedNow ? t('toasts.granted') : t('toasts.revoked'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.failed'));
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <div className="inline-flex rounded-lg border border-border-subtle p-1">
        {(['person', 'workspace'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setSubjectId(null);
              setSubjectQuery('');
              setTargetQuery('');
            }}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ring-gold-focus',
              mode === m ? 'bg-gold-500/15 text-gold-200' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(m === 'person' ? 'byPerson' : 'byWorkspace')}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        {/* ── Left: pick the subject ─────────────────────────────────────── */}
        <Card className="flex max-h-[70vh] flex-col p-0">
          <div className="border-b border-border-subtle p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={subjectQuery}
                onChange={(e) => setSubjectQuery(e.target.value)}
                placeholder={t(mode === 'person' ? 'searchPeople' : 'searchWorkspaces')}
                className="ps-8"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {subjects.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('noMatches')}</p>
            ) : (
              subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSubjectId(s.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition-colors ring-gold-focus',
                    s.id === selected?.id ? 'bg-gold-500/10' : 'hover:bg-secondary/50',
                  )}
                >
                  {s.ws ? (
                    <AppIcon
                      name={s.title}
                      dockerImage={s.ws.dockerImage}
                      category={s.ws.category}
                      iconUrl={s.ws.iconUrl}
                      rounded="rounded-lg"
                      className="size-8"
                    />
                  ) : (
                    <Monogram name={s.title} className="size-8" />
                  )}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.subtitle}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* ── Right: toggle access, one row at a time ─────────────────────── */}
        <Card className="flex max-h-[70vh] flex-col p-0">
          {!selected ? (
            <EmptyState
              icon={mode === 'person' ? UsersIcon : AppWindow}
              title={t(mode === 'person' ? 'empty.noPeople' : 'empty.noWorkspaces')}
              description={t('empty.description')}
            />
          ) : mode === 'person' ? (
            <PersonPane
              user={users.find((u) => u.id === selected.id)!}
              workspaces={workspaces}
              groupNames={groupNames}
              denyByDefault={denyByDefault}
              query={targetQuery}
              onQuery={setTargetQuery}
              busy={busy}
              onToggle={(ws, granted) =>
                run(`${ws.id}:${selected.id}`, () => setUserAccess(ws.id, selected.id, granted), granted)
              }
            />
          ) : (
            <WorkspacePane
              workspace={workspaces.find((w) => w.id === selected.id)!}
              users={users}
              groups={groups}
              query={targetQuery}
              onQuery={setTargetQuery}
              busy={busy}
              onToggleUser={(userId, granted) =>
                run(`${selected.id}:${userId}`, () => setUserAccess(selected.id, userId, granted), granted)
              }
              onToggleGroup={(groupId, granted) =>
                run(`${selected.id}:${groupId}`, () => setGroupAccess(selected.id, groupId, granted), granted)
              }
            />
          )}
        </Card>
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t('footnote')}
      </p>
    </div>
  );
}

/** One person → every workspace, sorted so what they already have is on top. */
function PersonPane({
  user,
  workspaces,
  groupNames,
  denyByDefault,
  query,
  onQuery,
  busy,
  onToggle,
}: {
  user: UserRow;
  workspaces: Workspace[];
  groupNames: Map<string, string>;
  denyByDefault: boolean;
  query: string;
  onQuery: (v: string) => void;
  busy: Set<string>;
  onToggle: (ws: Workspace, granted: boolean) => void;
}) {
  const t = useTranslations('access.assignments');
  // A group whose name we cannot resolve still has to render something the admin
  // can act on, so fall back to its id rather than an empty quote.
  const groupLabel = (id: string) => groupNames.get(id) ?? id;
  const [type, setType] = useState<WorkspaceType | 'ALL'>('ALL');

  // Only the kinds this deployment actually has. Offering "VM" to someone who
  // runs nothing but containers is a filter that can only ever return nothing.
  const availableTypes = useMemo(() => {
    const present = new Set(workspaces.map((w) => w.type));
    return WORKSPACE_TYPE_ORDER.filter((k) => present.has(k));
  }, [workspaces]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspaces
      .filter((w) => type === 'ALL' || w.type === type)
      .filter((w) => !q || w.friendlyName.toLowerCase().includes(q))
      .map((w) => ({ ws: w, access: workspaceAccessFor(w, user, denyByDefault) }))
      .sort(
        (a, b) =>
          WORKSPACE_ACCESS_RANK[a.access.kind] - WORKSPACE_ACCESS_RANK[b.access.kind] ||
          a.ws.friendlyName.localeCompare(b.ws.friendlyName),
      );
  }, [workspaces, user, denyByDefault, query, type]);

  // Count over everything, not the filtered view: "3 of 5" has to mean the
  // person's actual situation, not whatever the chip row happens to show.
  const granted = useMemo(
    () => workspaces.filter((w) => workspaceAccessFor(w, user, denyByDefault).kind !== 'none').length,
    [workspaces, user, denyByDefault],
  );

  return (
    <>
      <PaneHeader
        title={user.name}
        subtitle={t('personSummary', { granted, total: workspaces.length })}
        query={query}
        onQuery={onQuery}
        placeholder={t('searchWorkspaces')}
      >
        {availableTypes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', ...availableTypes] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ring-gold-focus',
                  type === k
                    ? 'border-gold-500/50 bg-gold-500/10 text-gold-200'
                    : 'border-border-subtle text-muted-foreground hover:text-foreground',
                )}
              >
                {t(k === 'ALL' ? 'types.all' : `types.${k}`)}
              </button>
            ))}
          </div>
        )}
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('noMatches')}</p>
        ) : (
          rows.map(({ ws, access }) => {
            const key = `${ws.id}:${user.id}`;
            const pending = busy.has(key);
            const lockedByGroup = access.kind === 'group';
            return (
              <div
                key={ws.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40"
              >
                <AppIcon
                  name={ws.friendlyName}
                  dockerImage={ws.dockerImage}
                  category={ws.category}
                  iconUrl={ws.iconUrl}
                  rounded="rounded-lg"
                  className="size-9"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{ws.friendlyName}</span>
                    {/* Desktop, service or container — the three words people use
                        for these, and previously indistinguishable in any list. */}
                    <Badge variant="outline">{t(`types.${ws.type}`)}</Badge>
                    {!ws.enabled && <Badge variant="outline">{t('badges.disabled')}</Badge>}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {access.kind === 'group'
                      ? t('viaGroup', { name: groupLabel(access.groupId) })
                      : access.kind === 'everyone'
                        ? t('openToEveryone')
                        : ws.dockerImage || ws.category}
                  </p>
                </div>
                {pending ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : lockedByGroup ? (
                  // A group grant is not this person's to lose. Showing an
                  // enabled switch here would let an admin "turn it off" and
                  // watch the row snap back — so say why instead.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Switch checked disabled aria-label={t('viaGroup', { name: groupLabel(access.groupId) })} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('viaGroupHint', { name: groupLabel(access.groupId) })}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Switch
                    checked={access.kind === 'direct'}
                    onCheckedChange={(next) => onToggle(ws, next)}
                    aria-label={t('toggleAria', { workspace: ws.friendlyName, person: user.name })}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/** One workspace → the groups and people who hold it. */
function WorkspacePane({
  workspace,
  users,
  groups,
  query,
  onQuery,
  busy,
  onToggleUser,
  onToggleGroup,
}: {
  workspace: Workspace;
  users: UserRow[];
  groups: { id: string; name: string }[];
  query: string;
  onQuery: (v: string) => void;
  busy: Set<string>;
  onToggleUser: (userId: string, granted: boolean) => void;
  onToggleGroup: (groupId: string, granted: boolean) => void;
}) {
  const t = useTranslations('access.assignments');
  const grantedUsers = workspace.assignedUserIds ?? [];
  const grantedGroups = workspace.assignedGroupIds ?? [];
  const q = query.trim().toLowerCase();

  const groupRows = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  const userRows = users
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(grantedUsers.includes(b.id)) - Number(grantedUsers.includes(a.id)) || a.name.localeCompare(b.name),
    );

  const open = grantedUsers.length === 0 && grantedGroups.length === 0;

  return (
    <>
      <PaneHeader
        title={workspace.friendlyName}
        subtitle={
          open
            ? t('workspaceUngranted')
            : t('workspaceSummary', { users: grantedUsers.length, groups: grantedGroups.length })
        }
        query={query}
        onQuery={onQuery}
        placeholder={t('searchPeopleOrGroups')}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <SectionLabel icon={UsersRound} label={t('sections.groups')} />
        {groupRows.length === 0 ? (
          <p className="px-2 pb-2 text-xs text-muted-foreground/70">{t('noMatches')}</p>
        ) : (
          groupRows.map((g) => (
            <Row
              key={g.id}
              title={g.name}
              subtitle={t('groupSubtitle')}
              avatar={<Monogram name={g.name} className="size-9" />}
              checked={grantedGroups.includes(g.id)}
              pending={busy.has(`${workspace.id}:${g.id}`)}
              onChange={(next) => onToggleGroup(g.id, next)}
              aria={t('toggleAria', { workspace: workspace.friendlyName, person: g.name })}
            />
          ))
        )}

        <SectionLabel icon={UsersIcon} label={t('sections.people')} />
        {userRows.length === 0 ? (
          <p className="px-2 pb-2 text-xs text-muted-foreground/70">{t('noMatches')}</p>
        ) : (
          userRows.map((u) => {
            const viaGroup = grantedGroups.find((g) => u.groupIds.includes(g));
            return (
              <Row
                key={u.id}
                title={u.name}
                subtitle={
                  viaGroup
                    ? t('viaGroup', { name: groups.find((g) => g.id === viaGroup)?.name ?? viaGroup })
                    : u.email
                }
                avatar={<Monogram name={u.name} className="size-9" />}
                checked={grantedUsers.includes(u.id)}
                pending={busy.has(`${workspace.id}:${u.id}`)}
                onChange={(next) => onToggleUser(u.id, next)}
                aria={t('toggleAria', { workspace: workspace.friendlyName, person: u.name })}
              />
            );
          })
        )}
      </div>
    </>
  );
}

function PaneHeader({
  title,
  subtitle,
  query,
  onQuery,
  placeholder,
  children,
}: {
  title: string;
  subtitle: string;
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  /** Optional filter row under the search box. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-border-subtle p-3">
      <div className="leading-tight">
        <p className="font-display text-base font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} className="ps-8" />
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: typeof UsersIcon; label: string }) {
  return (
    <p className="flex items-center gap-1.5 px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground first:pt-1">
      <Icon className="size-3.5" />
      {label}
    </p>
  );
}

function Row({
  title,
  subtitle,
  avatar,
  checked,
  pending,
  onChange,
  aria,
}: {
  title: string;
  subtitle: string;
  avatar: React.ReactNode;
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
  aria: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/40">
      {avatar}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {checked && <Check className="size-3.5 shrink-0 text-success" />}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {pending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch checked={checked} onCheckedChange={onChange} aria-label={aria} />
      )}
    </div>
  );
}
