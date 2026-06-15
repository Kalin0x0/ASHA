'use client';

import { BookOpen, ExternalLink, FileJson, PlugZap, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API_BASE_URL, isLive } from '@/lib/api/mode';

// The API mounts interactive OpenAPI docs at /api/docs (sibling of the
// versioned API base, which ends in /api/v1).
const docsUrl = API_BASE_URL.replace(/\/v\d+$/, '').replace(/\/$/, '') + '/docs';
const openapiUrl = `${docsUrl}-json`;

export default function ApiDocsPage() {
  const t = useTranslations('developer');
  const tCommon = useTranslations('common');
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('apiDocs.title')}
        description={t('apiDocs.description')}
        actions={
          <Button asChild size="sm">
            <a href={docsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> {t('apiDocs.openSwaggerUi')}
            </a>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card elevation={1} className="space-y-3 p-5">
          <BookOpen className="size-6 text-gold-300" />
          <h2 className="font-display text-lg font-medium">{t('apiDocs.interactiveExplorer')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('apiDocs.interactiveExplorerDescription')}{' '}
            <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">/api/docs</code>.
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={docsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> {tCommon('actions.launch')}
            </a>
          </Button>
        </Card>

        <Card elevation={1} className="space-y-3 p-5">
          <FileJson className="size-6 text-gold-300" />
          <h2 className="font-display text-lg font-medium">{t('apiDocs.openapiSpec')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('apiDocs.openapiSpecDescription')}
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={openapiUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> openapi.json
            </a>
          </Button>
        </Card>

        <Card elevation={1} className="space-y-3 p-5">
          <Terminal className="size-6 text-gold-300" />
          <h2 className="font-display text-lg font-medium">{t('apiDocs.authentication')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('apiDocs.authDescriptionBeforeCode')}{' '}
            <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">/auth/login</code>{' '}
            {t('apiDocs.authDescriptionAfterCode')}
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/developer/api-keys">
              <ExternalLink className="size-3.5" /> {t('apiDocs.manageApiKeys')}
            </Link>
          </Button>
        </Card>
      </div>

      <Card elevation={1} className="overflow-hidden p-0">
        <div className="border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('apiDocs.embeddedExplorer')}</h2>
        </div>
        {isLive ? (
          <iframe src={docsUrl} title={t('apiDocs.iframeTitle')} className="h-[70vh] w-full bg-white" />
        ) : (
          <EmptyState
            icon={PlugZap}
            title={t('apiDocs.backendNotConnectedTitle')}
            description={t('apiDocs.backendNotConnectedDescription')}
            action={
              <Button asChild variant="secondary" size="sm">
                <a href={docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" /> {t('apiDocs.openSwaggerUiNewTab')}
                </a>
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}
