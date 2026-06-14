'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiPasskey,
  deletePasskey,
  getPasskeyRegistrationOptions,
  getPasskeys,
  verifyPasskeyRegistration,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function SecurityPage() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const [passkeys, setPasskeys] = useState<ApiPasskey[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setPasskeys(await getPasskeys());
    } catch {
      toast.error(t('security.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnroll = async () => {
    setEnrolling(true);
    try {
      const options = await getPasskeyRegistrationOptions();
      const response = await startRegistration({ optionsJSON: options as never });
      await verifyPasskeyRegistration(response, deviceName || undefined);
      toast.success(t('security.toasts.registered'));
      setDeviceName('');
      await refresh();
    } catch (e) {
      // Browser throws if the user cancels or the authenticator is unavailable.
      toast.error(e instanceof Error ? e.message : t('security.toasts.registrationFailed'));
    } finally {
      setEnrolling(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deletePasskey(id);
      toast.success(t('security.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('security.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('security.title')}
        description={t('security.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('security.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('security.stats.passkeys')} value={passkeys.length} icon={Fingerprint} primary />
        <StatCard label={t('security.stats.method')} value={1} icon={KeyRound} format={() => 'WebAuthn'} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('security.yourPasskeys')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {passkeys.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('security.empty')}</p>
          ) : (
            passkeys.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Fingerprint className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.deviceName}</p>
                  <p className="truncate text-xs text-muted-foreground">{t('security.added', { date: new Date(p.createdAt).toLocaleDateString(locale) })}</p>
                </div>
                <Button variant="ghost" size="icon-sm" disabled={busyId === p.id} onClick={() => void onDelete(p.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('security.addPasskey')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('security.addPasskeyHint')}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>{t('security.fields.deviceName')}</Label>
            <Input placeholder={t('security.placeholders.deviceName')} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => void onEnroll()} disabled={!isLive || enrolling}>
            {enrolling ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {t('security.registerPasskey')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
