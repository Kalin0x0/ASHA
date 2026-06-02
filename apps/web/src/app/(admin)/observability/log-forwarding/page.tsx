'use client';

import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiLogForwarder,
  type LogForwarderType,
  createLogForwarder,
  deleteLogForwarder,
  getLogForwarders,
  updateLogForwarder,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const TYPES: { key: LogForwarderType; label: string }[] = [
  { key: 'syslog', label: 'Syslog' },
  { key: 'splunk_hec', label: 'Splunk HEC' },
  { key: 'elasticsearch', label: 'Elasticsearch' },
  { key: 'loki', label: 'Loki' },
  { key: 'http', label: 'HTTP' },
];

export default function LogForwardingPage() {
  const [forwarders, setForwarders] = useState<ApiLogForwarder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<LogForwarderType>('loki');
  const [endpoint, setEndpoint] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setForwarders(await getLogForwarders());
    } catch {
      toast.error('Failed to load log forwarders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!name) return;
    setCreating(true);
    try {
      await createLogForwarder({ name, type, endpoint: endpoint || undefined, enabled: false });
      toast.success('Log forwarder added', { description: 'Disabled by default — enable after verifying.' });
      setName('');
      setEndpoint('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add forwarder');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (f: ApiLogForwarder) => {
    setBusyId(f.id);
    try {
      await updateLogForwarder(f.id, { enabled: !f.enabled });
      await refresh();
    } catch {
      toast.error('Could not update forwarder');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteLogForwarder(id);
      toast.success('Forwarder removed');
      await refresh();
    } catch {
      toast.error('Could not remove forwarder');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Forwarding"
        description="Stream session and audit events to your SIEM via Fluent Bit — syslog, Splunk HEC, Elasticsearch, Loki, or generic HTTP."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Log forwarding is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Forwarders" value={forwarders.length} icon={Send} primary />
        <StatCard label="Enabled" value={forwarders.filter((f) => f.enabled).length} icon={Send} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured forwarders</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {forwarders.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No log forwarders configured yet.</p>
          ) : (
            forwarders.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Send className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.endpoint ?? '—'}</p>
                </div>
                <Badge variant="gold">{f.type}</Badge>
                <Badge variant={f.enabled ? 'success' : 'outline'}>{f.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === f.id} onClick={() => void onToggle(f)}>
                  {f.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === f.id} onClick={() => void onDelete(f.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add forwarder</h2>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                type === t.key
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="prod-loki" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Endpoint URL</Label>
            <Input placeholder="https://loki.example.com/loki/api/v1/push" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add forwarder
        </Button>
      </Card>
    </div>
  );
}
