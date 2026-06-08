'use client';

import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiApiKey,
  createApiKey,
  getApiKeys,
  revokeApiKey,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const SCOPE_OPTIONS = ['SCIM', 'SESSION_LAUNCH', 'REPORTING_VIEW', 'WORKSPACE_MANAGE'];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setKeys(await getApiKeys());
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const onCreate = async () => {
    if (!name) return;
    setCreating(true);
    try {
      const res = await createApiKey({
        name,
        scopes,
        expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
      });
      setRevealed(res.token);
      toast.success('API key created', { description: 'Copy it now — it is shown only once.' });
      setName('');
      setScopes([]);
      setExpiresInDays('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create key');
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusyId(id);
    try {
      await revokeApiKey(id);
      toast.success('Key revoked');
      await refresh();
    } catch {
      toast.error('Could not revoke key');
    } finally {
      setBusyId(null);
    }
  };

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Programmatic access tokens for the Chista API. Each key carries scopes and an optional expiry; the secret is shown once."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          API key management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      {revealed && (
        <Card elevation={1} className="space-y-2 border-gold-500/30 bg-gold-500/5 p-4">
          <p className="text-sm font-medium text-gold-300">New API key — copy it now</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{revealed}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(revealed);
                toast.success('Copied to clipboard');
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setRevealed(null)}>
              <Check className="size-4" />
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Active keys" value={active.length} icon={KeyRound} primary />
        <StatCard label="Total issued" value={keys.length} icon={KeyRound} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Keys</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {keys.length === 0 ? (
            <EmptyState icon={KeyRound} title="No API keys issued" description="Create a key to enable programmatic access to the Chista API." />
          ) : (
            keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                <KeyRound className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{k.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{k.prefix}…</p>
                </div>
                <div className="hidden flex-wrap gap-1 sm:flex">
                  {k.scopes.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
                {k.revokedAt ? (
                  <Badge variant="outline">Revoked</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
                {!k.revokedAt && (
                  <Button variant="ghost" size="icon-sm" disabled={busyId === k.id} onClick={() => void onRevoke(k.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Create key</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="ci-deploy-bot" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Expires in (days, optional)</Label>
            <Input
              type="number"
              min={1}
              placeholder="never"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <Label className="mb-1.5">Scopes</Label>
          <div className="flex flex-wrap gap-2">
            {SCOPE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => toggleScope(s)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  scopes.includes(s)
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Create key
        </Button>
      </Card>
    </div>
  );
}
