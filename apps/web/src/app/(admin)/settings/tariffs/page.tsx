'use client';

import { Gauge, Loader2, Plus, Save, Star, Timer, Trash2, UserCog, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  type ApiGroup,
  type ApiTariff,
  type ApiTariffAssignment,
  type ApiUser,
  type TariffPeriod,
  type UpsertTariffInput,
  assignTariff,
  deleteTariff,
  getGroups,
  getTariffAssignments,
  getTariffs,
  getUsers,
  upsertTariff,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { cn } from '@/lib/utils';

const PERIODS: TariffPeriod[] = ['MINUTE', 'HOUR', 'MONTH'];

const emptyDraft = (): UpsertTariffInput => ({
  name: '',
  period: 'MONTH',
  budgetMinutes: 600,
  maxSessionMinutes: null,
  maxConcurrent: null,
  isDefault: false,
});

export default function TariffsPage() {
  const t = useTranslations('settings');
  const [tariffs, setTariffs] = useState<ApiTariff[]>([]);
  const [assignments, setAssignments] = useState<ApiTariffAssignment[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<UpsertTariffInput>(emptyDraft());

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [ts, as, us, gs] = await Promise.all([getTariffs(), getTariffAssignments(), getUsers(), getGroups()]);
      setTariffs(ts);
      setAssignments(as);
      setUsers(us);
      setGroups(gs);
    } catch {
      toast.error(t('tariffs.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const editing = Boolean(draft.id);

  const onSave = async () => {
    if (!draft.name.trim()) {
      toast.error(t('tariffs.toasts.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await upsertTariff(draft);
      toast.success(t('tariffs.toasts.saved'));
      setDraft(emptyDraft());
      await refresh();
    } catch {
      toast.error(t('tariffs.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteTariff(id);
      toast.success(t('tariffs.toasts.deleted'));
      if (draft.id === id) setDraft(emptyDraft());
      await refresh();
    } catch {
      toast.error(t('tariffs.toasts.deleteFailed'));
    }
  };

  const defaultTariff = tariffs.find((x) => x.isDefault);

  return (
    <div className="space-y-6">
      <PageHeader title={t('tariffs.title')} description={t('tariffs.description')} />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('tariffs.liveOnly', {
            code: (chunks) => <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>,
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('tariffs.stats.plans')} value={tariffs.length} icon={Timer} primary />
        <StatCard label={t('tariffs.stats.assignments')} value={assignments.length} icon={UserCog} />
        <StatCard
          label={t('tariffs.stats.default')}
          value={defaultTariff ? 1 : 0}
          icon={Star}
          format={() => defaultTariff?.name ?? t('tariffs.noDefault')}
        />
      </div>

      {/* Editor */}
      <Card elevation={1} className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">{editing ? t('tariffs.editPlan') : t('tariffs.newPlan')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">{t('tariffs.fields.name')}</label>
            <Input value={draft.name} placeholder={t('tariffs.fields.namePlaceholder')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('tariffs.fields.period')}</label>
            <div className="mt-1 flex gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft({ ...draft, period: p })}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs transition-colors',
                    draft.period === p
                      ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                      : 'border-border-subtle text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {t(`tariffs.periods.${p}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumField
            label={t('tariffs.fields.budgetMinutes')}
            hint={t('tariffs.fields.budgetHint')}
            value={draft.budgetMinutes}
            onChange={(v) => setDraft({ ...draft, budgetMinutes: v })}
          />
          <NumField
            label={t('tariffs.fields.maxSessionMinutes')}
            hint={t('tariffs.fields.maxSessionHint')}
            value={draft.maxSessionMinutes}
            onChange={(v) => setDraft({ ...draft, maxSessionMinutes: v })}
          />
          <NumField
            label={t('tariffs.fields.maxConcurrent')}
            hint={t('tariffs.fields.maxConcurrentHint')}
            value={draft.maxConcurrent}
            onChange={(v) => setDraft({ ...draft, maxConcurrent: v })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isDefault ?? false}
            onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
            className="size-4 accent-gold-500"
          />
          <span>{t('tariffs.fields.isDefault')}</span>
          <span className="text-xs text-muted-foreground">{t('tariffs.fields.isDefaultHint')}</span>
        </label>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void onSave()} disabled={!isLive || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : editing ? <Save className="size-3.5" /> : <Plus className="size-3.5" />}
            {editing ? t('tariffs.savePlan') : t('tariffs.createPlan')}
          </Button>
          {editing && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(emptyDraft())}>
              <X className="size-3.5" /> {t('tariffs.cancelEdit')}
            </Button>
          )}
          <Badge variant="info">{t('tariffs.enforcedAtLaunch')}</Badge>
        </div>
      </Card>

      {/* Plans list */}
      <Card elevation={1} className="space-y-3 p-5">
        <h2 className="font-display text-lg font-medium">{t('tariffs.plans')}</h2>
        {tariffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tariffs.empty')}</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {tariffs.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                <Gauge className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{x.name}</span>
                    {x.isDefault && <Badge variant="success">{t('tariffs.defaultBadge')}</Badge>}
                    <Badge variant="outline">{t(`tariffs.periods.${x.period}`)}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {x.budgetMinutes != null ? t('tariffs.summary.budget', { minutes: x.budgetMinutes }) : t('tariffs.summary.unlimited')}
                    {x.maxSessionMinutes != null && ` · ${t('tariffs.summary.maxSession', { minutes: x.maxSessionMinutes })}`}
                    {x.maxConcurrent != null && ` · ${t('tariffs.summary.maxConcurrent', { count: x.maxConcurrent })}`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setDraft({ ...x })}>
                  {t('tariffs.edit')}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void onDelete(x.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Assignments */}
      <AssignPanel tariffs={tariffs} users={users} groups={groups} assignments={assignments} disabled={!isLive} onChanged={refresh} />
    </div>
  );
}

function NumField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={1}
        value={value ?? ''}
        placeholder="∞"
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
      />
      <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>
    </div>
  );
}

function AssignPanel({
  tariffs,
  users,
  groups,
  assignments,
  disabled,
  onChanged,
}: {
  tariffs: ApiTariff[];
  users: ApiUser[];
  groups: ApiGroup[];
  assignments: ApiTariffAssignment[];
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('settings');
  const [tariffId, setTariffId] = useState('');
  const [subjectType, setSubjectType] = useState<'USER' | 'GROUP'>('USER');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);

  const tariffName = useMemo(() => new Map(tariffs.map((x) => [x.id, x.name] as const)), [tariffs]);
  const subjectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.displayName || u.username || u.email);
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [users, groups]);

  const subjects = subjectType === 'USER' ? users.map((u) => ({ id: u.id, label: u.displayName || u.username || u.email })) : groups.map((g) => ({ id: g.id, label: g.name }));

  // Only user/group rows here — the ORG default is managed via the "default" flag.
  const rows = assignments.filter((a) => a.subjectType !== 'ORG');

  const onAssign = async () => {
    if (!tariffId || !subjectId) {
      toast.error(t('tariffs.toasts.pickBoth'));
      return;
    }
    setBusy(true);
    try {
      await assignTariff({ tariffId, subjectType, subjectId });
      toast.success(t('tariffs.toasts.assigned'));
      setSubjectId('');
      await onChanged();
    } catch {
      toast.error(t('tariffs.toasts.assignFailed'));
    } finally {
      setBusy(false);
    }
  };

  const selectClass =
    'mt-1 h-9 w-full rounded-md border border-border-subtle bg-anthracite-950/40 px-2 text-sm text-foreground outline-none ring-gold-focus disabled:opacity-50';

  return (
    <Card elevation={1} className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-medium">{t('tariffs.assign.title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('tariffs.assign.hint')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className="text-xs text-muted-foreground">{t('tariffs.assign.plan')}</label>
          <select className={selectClass} value={tariffId} disabled={disabled} onChange={(e) => setTariffId(e.target.value)}>
            <option value="">{t('tariffs.assign.selectPlan')}</option>
            {tariffs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('tariffs.assign.subjectType')}</label>
          <div className="mt-1 flex gap-2">
            {(['USER', 'GROUP'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSubjectType(s);
                  setSubjectId('');
                }}
                className={cn(
                  'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                  subjectType === s
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary',
                )}
              >
                {t(`tariffs.assign.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t(`tariffs.assign.${subjectType}`)}</label>
          <select className={selectClass} value={subjectId} disabled={disabled} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{t('tariffs.assign.selectSubject')}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button size="sm" className="w-full" onClick={() => void onAssign()} disabled={disabled || busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserCog className="size-3.5" />}
            {t('tariffs.assign.apply')}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="divide-y divide-border-subtle border-t border-border-subtle pt-2">
          {rows.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Badge variant="outline">{t(`tariffs.assign.${a.subjectType}`)}</Badge>
              <span className="font-medium">{subjectName.get(a.subjectId) ?? a.subjectId}</span>
              <span className="text-muted-foreground">→ {tariffName.get(a.tariffId) ?? a.tariffId}</span>
              <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                {t('tariffs.assign.remaining', { minutes: Math.floor(a.remainingSeconds / 60) })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
