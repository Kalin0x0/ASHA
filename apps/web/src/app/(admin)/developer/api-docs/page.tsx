'use client';

import { BookOpen, ExternalLink, FileJson, PlugZap, Terminal } from 'lucide-react';
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
  return (
    <div className="space-y-6">
      <PageHeader
        title="API Docs"
        description="Chista exposes a fully documented REST API with an interactive OpenAPI (Swagger) explorer."
        actions={
          <Button asChild size="sm">
            <a href={docsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Open Swagger UI
            </a>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card elevation={1} className="space-y-3 p-5">
          <BookOpen className="size-6 text-gold-300" />
          <h2 className="font-display text-lg font-medium">Interactive explorer</h2>
          <p className="text-sm text-muted-foreground">
            Try every endpoint with live auth from the Swagger UI, served by the API at{' '}
            <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">/api/docs</code>.
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={docsUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Launch
            </a>
          </Button>
        </Card>

        <Card elevation={1} className="space-y-3 p-5">
          <FileJson className="size-6 text-gold-300" />
          <h2 className="font-display text-lg font-medium">OpenAPI spec</h2>
          <p className="text-sm text-muted-foreground">
            Download the raw OpenAPI JSON to generate clients or import into Postman/Insomnia.
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={openapiUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> openapi.json
            </a>
          </Button>
        </Card>

        <Card elevation={1} className="space-y-3 p-5">
          <Terminal className="size-6 text-gold-300" />
          <h2 className="font-display text-lg font-medium">Authentication</h2>
          <p className="text-sm text-muted-foreground">
            Authenticate with a Bearer token from{' '}
            <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">/auth/login</code> or an API key
            issued under Developer → API Keys.
          </p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/developer/api-keys">
              <ExternalLink className="size-3.5" /> Manage API keys
            </Link>
          </Button>
        </Card>
      </div>

      <Card elevation={1} className="overflow-hidden p-0">
        <div className="border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Embedded explorer</h2>
        </div>
        {isLive ? (
          <iframe src={docsUrl} title="Chista API docs" className="h-[70vh] w-full bg-white" />
        ) : (
          <EmptyState
            icon={PlugZap}
            title="Backend not connected"
            description="The embedded Swagger UI loads from the live API. Run with NEXT_PUBLIC_API_MODE=live to explore endpoints here."
            action={
              <Button asChild variant="secondary" size="sm">
                <a href={docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" /> Open Swagger UI in a new tab
                </a>
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}
