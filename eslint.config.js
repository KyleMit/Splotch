import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Flat config lives at the repo root (where package.json / node_modules are), but the app
// source is under web/. Type checking is owned by `npm run check` (svelte-check); ESLint runs
// without a TS program so it stays fast and tolerant of the toolchain (e.g. TypeScript majors)
// — it covers correctness/style rules and the project conventions, not type errors.
export default tseslint.config(
  {
    ignores: [
      '**/.svelte-kit/',
      '**/build/',
      '**/.netlify/',
      '**/node_modules/',
      'android/',
      'ios/',
      'web/src/lib/components/icon-names.d.ts',
      'web/src/lib/releases.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // TypeScript already resolves identifiers (including Svelte 5 runes and compile-time
      // constants like __APP_VERSION__), so ESLint's own undefined/unused checks only add noise.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Empty catch blocks are how the engine ignores best-effort pointer-capture calls.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Internal route/static links don't use SvelteKit's resolve(); the app has no base path.
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Bare member reads inside $effect register reactive dependencies (idiomatic Svelte 5);
      // they are intentional, not dead expressions.
      '@typescript-eslint/no-unused-expressions': 'off',
      // Misfires on `$bindable()` destructuring defaults, which read as unused assignments.
      'no-useless-assignment': 'off',
    },
  },
  {
    // Project conventions (CLAUDE.md, ADR-0002): Svelte 5 runes only — no legacy stores.
    files: ['web/src/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'svelte/store',
              message:
                'Use Svelte 5 runes ($state/$derived/$effect) instead of legacy stores (ADR-0002).',
            },
          ],
        },
      ],
    },
  },
  prettier
);
