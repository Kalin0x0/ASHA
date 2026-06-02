import { defineConfig } from 'vitest/config';

/**
 * Central test runner for the monorepo. Pure-logic packages and the web
 * library helpers are deterministic and run in a Node environment — no DB,
 * Redis, or browser required.
 */
export default defineConfig({
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
