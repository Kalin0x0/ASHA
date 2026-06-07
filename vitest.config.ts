import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Central test runner for the monorepo. Pure-logic packages and the web
 * library helpers are deterministic and run in a Node environment — no DB,
 * Redis, or browser required.
 */
const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = (name: string) => resolve(root, `packages/${name}/src/index.ts`);

export default defineConfig({
  // Resolve workspace packages from source so tests run without a prior `dist`
  // build (the package `exports` point at dist, which CI/dev may not have built).
  resolve: {
    alias: {
      '@chista/config': pkg('config'),
      '@chista/contracts': pkg('contracts'),
      '@chista/crypto': pkg('crypto'),
      '@chista/db': pkg('db'),
      '@chista/events': pkg('events'),
      '@chista/logger': pkg('logger'),
      '@chista/proxy-labels': pkg('proxy-labels'),
      '@chista/rbac': pkg('rbac'),
    },
  },
  // The API/agent classes use legacy NestJS decorators; tests instantiate them
  // directly (no DI metadata needed), but esbuild must accept the syntax.
  esbuild: {
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  },
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'apps/connection-proxy/src/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: false,
  },
});
