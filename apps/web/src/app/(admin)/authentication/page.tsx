'use client';

import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Network,
  Plus,
  ShieldCheck,
  TestTube2,
  Trash2,
  UserCog,
  Users2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiAuthProvider,
  type ApiGroup,
  type ApiSsoMapping,
  type AuthProviderType,
  createAuthProvider,
  createSsoMapping,
  deleteAuthProvider,
  deleteSsoMapping,
  getAuthProviders,
  getGroups,
  getSsoMappings,
  issueScimToken,
  testLdapProvider,
  updateAuthProvider,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

type ProviderConfigField = { key: string; label: string; placeholder?: string; secret?: boolean };

// Provider-specific config templates so admins know what to fill in.
const CONFIG_FIELDS: Record<Exclude<AuthProviderType, 'LOCAL'>, ProviderConfigField[]> = {
  OIDC: [
    { key: 'issuer', label: 'Issuer URL', placeholder: 'https://accounts.google.com' },
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', secret: true },
    { key: 'redirectUri', label: 'Redirect URI (optional)', placeholder: 'https://chista.local/api/v1/auth/oidc/<id>/callback' },
  ],
  SAML: [
    { key: 'entryPoint', label: 'IdP SSO URL', placeholder: 'https://idp.example.com/sso' },
    { key: 'issuer', label: 'SP Entity ID', placeholder: 'chista' },
    { key: 'cert', label: 'IdP Signing Certificate (PEM)', secret: true },
  ],
  LDAP: [
    { key: 'url', label: 'LDAP URL', placeholder: 'ldaps://ad.example.com:636' },
    { key: 'bindDN', label: 'Bind DN', placeholder: 'cn=svc,dc=example,dc=com' },
    { key: 'bindCredentials', label: 'Bind Password', secret: true },
    { key: 'searchBase', label: 'Search Base', placeholder: 'ou=users,dc=example,dc=com' },
    { key: 'searchFilter', label: 'Search Filter', placeholder: '(uid={{username}})' },
  ],
};

const TYPE_LABEL: Record<AuthProviderType, string> = {
  LOCAL: 'Local',
  OIDC: 'OIDC',
  SAML: 'SAML 2.0',
  LDAP: 'LDAP / AD',
};

export default function AuthenticationPage() {
  const [providers, setProviders] = useState<ApiAuthProvider[]>([]);
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mappingsFor, setMappingsFor] = useState<string | null>(null);

  // New-provider form state
  const [newType, setNewType] = useState<Exclude<AuthProviderType, 'LOCAL'>>('OIDC');
  const [newName, setNewName] = useState('');
  const [newConfig, setNewConfig] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  // SCIM token reveal
  const [scimToken, setScimToken] = useState<string | null>(null);
  const [scimBusy, setScimBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [ps, gs] = await Promise.all([getAuthProviders(), getGroups()]);
      setProviders(ps);
      setGroups(gs);
    } catch {
      toast.error('Failed to load auth providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!newName) return;
    setCreating(true);
    try {
      await createAuthProvider({ type: newType, name: newName, enabled: false, config: newConfig });
      toast.success(`${TYPE_LABEL[newType]} provider added`, { description: 'Disabled by default — enable after testing.' });
      setNewName('');
      setNewConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create provider');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (p: ApiAuthProvider) => {
    setBusyId(p.id);
    try {
      await updateAuthProvider(p.id, { enabled: !p.enabled });
      await refresh();
    } catch {
      toast.error('Could not update provider');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteAuthProvider(id);
      toast.success('Provider removed');
      await refresh();
    } catch {
      toast.error('Could not remove provider');
    } finally {
      setBusyId(null);
    }
  };

  const onTestLdap = async (id: string) => {
    setBusyId(id);
    try {
      const res = await testLdapProvider(id);
      if (res.ok) toast.success('LDAP bind succeeded', { description: res.message });
      else toast.error('LDAP test failed', { description: res.message });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'LDAP test failed');
    } finally {
      setBusyId(null);
    }
  };

  const onIssueScim = async () => {
    setScimBusy(true);
    try {
      const { token } = await issueScimToken();
      setScimToken(token);
      toast.success('SCIM token issued', { description: 'Copy it now — it is shown only once.' });
    } catch {
      toast.error('Could not issue SCIM token');
    } finally {
      setScimBusy(false);
    }
  };

  const enabledCount = providers.filter((p) => p.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Authentication"
        description="Configure external identity providers (OIDC, SAML 2.0, LDAP/AD), SSO group mappings, and SCIM 2.0 provisioning."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Authentication management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Providers" value={providers.length} icon={KeyRound} primary />
        <StatCard label="Enabled" value={enabledCount} icon={ShieldCheck} />
        <StatCard label="SCIM" value={1} icon={UserCog} format={() => 'RFC 7644'} />
      </div>

      {/* Existing providers */}
      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Identity providers</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {providers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No external providers configured yet.</p>
          ) : (
            providers.map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Network className="size-4 text-gold-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {String((p.config as Record<string, unknown>).issuer ?? (p.config as Record<string, unknown>).url ?? (p.config as Record<string, unknown>).entryPoint ?? '—')}
                    </p>
                  </div>
                  <Badge variant={p.type === 'OIDC' ? 'gold' : 'outline'}>{TYPE_LABEL[p.type]}</Badge>
                  <Badge variant={p.enabled ? 'success' : 'outline'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Group mappings"
                    onClick={() => setMappingsFor(mappingsFor === p.id ? null : p.id)}
                  >
                    <Users2 className={`size-4 ${mappingsFor === p.id ? 'text-gold-300' : ''}`} />
                  </Button>
                  {p.type === 'LDAP' && (
                    <Button variant="ghost" size="icon-sm" disabled={busyId === p.id} onClick={() => void onTestLdap(p.id)} title="Test LDAP bind">
                      {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <TestTube2 className="size-4" />}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => void onToggle(p)}>
                    {p.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={busyId === p.id} onClick={() => void onDelete(p.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                {mappingsFor === p.id && (
                  <div className="border-t border-border-subtle/60 bg-anthracite-950/30 px-5 py-4">
                    <MappingPanel providerId={p.id} groups={groups} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Add provider */}
      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add provider</h2>
        <div className="flex flex-wrap gap-2">
          {(['OIDC', 'SAML', 'LDAP'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setNewType(t);
                setNewConfig({});
              }}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                newType === t
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div>
          <Label>Display name</Label>
          <Input placeholder={`${TYPE_LABEL[newType]} login`} value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CONFIG_FIELDS[newType].map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={newConfig[f.key] ?? ''}
                onChange={(e) => setNewConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !newName || creating}>
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Add provider
          </Button>
          <Badge variant="info">Created disabled — enable after a successful test</Badge>
        </div>
      </Card>

      {/* SCIM provisioning */}
      <Card elevation={1} className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <UserCog className="size-5 text-gold-300" />
          <h2 className="font-display text-lg font-medium">SCIM 2.0 provisioning</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Issue a bearer token for your IdP (Okta, Azure AD, OneLogin) to automatically provision and
          deprovision users and groups via the SCIM endpoint at{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">/scim/v2/&lt;orgId&gt;/Users</code>.
        </p>
        {scimToken ? (
          <div className="flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/5 p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{scimToken}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(scimToken);
                toast.success('Copied to clipboard');
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setScimToken(null)}>
              <Check className="size-4" />
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => void onIssueScim()} disabled={!isLive || scimBusy}>
            {scimBusy ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
            Issue SCIM token
          </Button>
        )}
      </Card>
    </div>
  );
}

/**
 * Per-provider SSO group-mapping editor: maps an IdP assertion attribute/value
 * (e.g. groups = "admins") onto a Chista group. Memberships in mapped groups
 * are reconciled on every federated login.
 */
function MappingPanel({ providerId, groups }: { providerId: string; groups: ApiGroup[] }) {
  const [mappings, setMappings] = useState<ApiSsoMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [attribute, setAttribute] = useState('groups');
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMappings(await getSsoMappings(providerId));
    } catch {
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;

  const onAdd = async () => {
    if (!groupId || !attribute || !value) return;
    setAdding(true);
    try {
      await createSsoMapping({ authConfigId: providerId, groupId, attribute, value });
      setValue('');
      toast.success('Mapping added');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add mapping');
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (id: string) => {
    try {
      await deleteSsoMapping(id);
      await load();
    } catch {
      toast.error('Could not remove mapping');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users2 className="size-4 text-gold-300" /> Group mappings
        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>

      {mappings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No mappings yet — users authenticate but join no groups automatically.</p>
      ) : (
        <div className="space-y-1.5">
          {mappings.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-md border border-border-subtle/60 px-3 py-2 text-xs">
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5">{m.attribute}</code>
              <span className="text-muted-foreground">=</span>
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5">{m.value}</code>
              <span className="text-muted-foreground">→</span>
              <Badge variant="gold">{groupName(m.groupId)}</Badge>
              <div className="flex-1" />
              <Button variant="ghost" size="icon-sm" onClick={() => void onRemove(m.id)}>
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8rem]">
          <Label className="text-xs">Attribute</Label>
          <Input value={attribute} onChange={(e) => setAttribute(e.target.value)} placeholder="groups" />
        </div>
        <div className="min-w-[8rem]">
          <Label className="text-xs">Value</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="admins" />
        </div>
        <div className="min-w-[10rem]">
          <Label className="text-xs">Chista group</Label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
          >
            <option value="">Select group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => void onAdd()} disabled={!groupId || !value || adding}>
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add
        </Button>
      </div>
    </div>
  );
}
