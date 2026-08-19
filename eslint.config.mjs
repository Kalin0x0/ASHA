// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Repo-wide lint baseline.
 *
 * Until now only `apps/web` had a config and a `lint` script, so `turbo run
 * lint` — and with it the CI "Lint" step — skipped apps/api (45 modules),
 * apps/agent, apps/connection-proxy and all eight packages: roughly 85% of the
 * code was reported green without ever being looked at.
 *
 * This is deliberately the *recommended* (non type-checked) tier. It catches
 * real defects — unreachable code, shadowed/unused symbols, misused promises in
 * the syntactic cases — without demanding a full type-aware pass over 59k lines
 * that has never been linted. `apps/web` keeps its own Next.js config.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'apps/web/**', // has its own next/core-web-vitals config
      'packages/db/prisma/migrations/**',
      'apps/web/public/vendor/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        // Node/Web globals used across the server apps and build scripts.
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: {
      // TypeScript resolves identifiers far better than this rule can, and it
      // produces false positives on ambient/DOM types. Recommended by
      // typescript-eslint itself for TS projects.
      'no-undef': 'off',
      // The codebase leans on `any`/`!` in a handful of Prisma-adjacent spots;
      // flagging those as errors would drown the signal from real defects.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Unused *arguments* are often intentional (interface conformance);
      // unused locals are not. Underscore-prefixed names are opt-out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // Tests legitimately use loose shapes to build fixtures.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
