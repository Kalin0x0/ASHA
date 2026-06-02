'use client';

import { Loader2, Plus, Send, Trash2, Webhook, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiWebhook,
  createWebhook,
  deleteWebhook,
  getWebhooks,
  testWebhook,
  updateWebhook,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const EVENT_OPTIONS = [
  'session.created',
  'session.started',
  'session.ended',
  'session.destroyed',
  'user.created',
  'user.disabled',
  'recording.completed',
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<ApiWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setWebhooks(await getWebhooks());
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleEvent = (e: string) =>
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  const onCreate = async () => {
    if (!name || !url || events.length === 0) return;
    setCreating(true);
    try {
      await createWebhook({ name, url, events, secret: secret || undefined, enabled: true });
      toast.success('Webhook created');
      setName('');
      setUrl('');
      setSecret('');
      setEvents([]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create webhook');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (w: ApiWebhook) => {
    setBusyId(w.id);
    try {
      await updateWebhook(w.id, { enabled: !w.enabled });
      await refresh();
    } catch {
      toast.error('Could not update webhook');
    } finally {
      setBusyId(null);
    }
  };

  const onTest = async (id: string) => {
    setBusyId(id);
    try {
      const res = await testWebhook(id);
      if (res.ok) toast.success('Test delivered', { description: res.status ? `HTTP ${res.status}` : undefined });
      else toast.error('Test failed', { description: res.status ? `HTTP ${res.status}` : undefined });
    } catch {
      toast.error('Test delivery failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteWebhook(id);
      toast.success('Webhook removed');
      await refresh();
    } catch {
      toast.error('Could not remove webhook');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Receive HMAC-signed event callbacks for sessions, users, and recordings. Verify the X-Chista-Signature header against your secret."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Webhook management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Webhooks" value={webhooks.length} icon={Webhook} primary />
        <StatCard label="Enabled" value={webhooks.filter((w) => w.enabled).length} icon={Webhook} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Endpoints</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {webhooks.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No webhooks configured yet.</p>
          ) : (
            webhooks.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Webhook className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{w.url}</p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">{w.events.length} event(s)</span>
                <Badge variant={w.enabled ? 'success' : 'outline'}>{w.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Button variant="ghost" size="icon-sm" title="Send test" disabled={busyId === w.id} onClick={() => void onTest(w.id)}>
                  {busyId === w.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
                <Button variant="secondary" size="sm" disabled={busyId === w.id} onClick={() => void onToggle(w)}>
                  {w.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === w.id} onClick={() => void onDelete(w.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add webhook</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="ops-notifier" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Payload URL</Label>
            <Input placeholder="https://hooks.example.com/chista" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Signing secret (optional)</Label>
            <Input type="password" placeholder="≥ 8 characters" value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 flex items-center gap-1.5">
            <Zap className="size-3.5" /> Events
          </Label>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => toggleEvent(e)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  events.includes(e)
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || !url || events.length === 0 || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add webhook
        </Button>
      </Card>
    </div>
  );
}
