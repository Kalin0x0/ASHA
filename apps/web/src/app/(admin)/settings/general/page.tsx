'use client';

import { Loader2, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { getGeneralSettings, upsertGeneralSettings } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

interface Row {
  key: string;
  value: string;
}

// Curated defaults so a fresh org shows meaningful keys to edit.
const SUGGESTED: Row[] = [
  { key: 'session.idleTimeoutMin', value: '30' },
  { key: 'session.maxDurationMin', value: '480' },
  { key: 'session.defaultProtocol', value: 'KASMVNC' },
  { key: 'security.requireMfa', value: 'false' },
];

export default function GeneralSettingsPage() {
  const [rows, setRows] = useState<Row[]>(SUGGESTED);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const settings = await getGeneralSettings();
      if (settings.length > 0) {
        setRows(settings.map((s) => ({ key: s.key, value: stringifyValue(s.valueJson) })));
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((cur) => [...cur, { key: '', value: '' }]);
  const removeRow = (i: number) => setRows((cur) => cur.filter((_, idx) => idx !== i));

  const onSave = async () => {
    setSaving(true);
    try {
      const settings = rows
        .filter((r) => r.key.trim())
        .map((r) => ({ key: r.key.trim(), value: parseValue(r.value) }));
      await upsertGeneralSettings(settings);
      toast.success('Settings saved');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="General"
        description="Organization-wide key/value settings — session defaults, security toggles, and other tunables consumed across the platform."
        actions={
          <Button size="sm" onClick={() => void onSave()} disabled={!isLive || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          General settings are live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <Card elevation={1} className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Settings2 className="size-5 text-gold-300" />
          <h2 className="font-display text-lg font-medium">Settings</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                {i === 0 && <Label className="text-xs">Key</Label>}
                <Input placeholder="namespace.key" value={r.key} onChange={(e) => setRow(i, { key: e.target.value })} />
              </div>
              <div className="flex-1">
                {i === 0 && <Label className="text-xs">Value</Label>}
                <Input placeholder="value" value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} />
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => removeRow(i)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus className="size-3.5" /> Add setting
        </Button>
      </Card>
    </div>
  );
}

function stringifyValue(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function parseValue(v: string): unknown {
  const t = v.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
}
