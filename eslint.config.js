import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const PLAYWRIGHT_IMPORT_RESTRICTION = {
  name: 'playwright',
  message: 'Import from @playwright/test — bare playwright is an undeclared transitive dependency.',
};
// Node builtins must use the node: protocol so a builtin import can't be shadowed by (or read
// as) an npm package. Generated from the runtime's own list rather than enumerated, so new
// builtins are covered without an edit here. Like the playwright restriction above, every
// no-restricted-imports entry in this config must carry these — a later block REPLACES, not
// merges, the paths list.
const NODE_BUILTIN_IMPORT_RESTRICTIONS = builtinModules
  .filter((name) => !name.startsWith('node:'))
  .map((name) => ({
    name,
    message: `Use the node: protocol (import from 'node:${name}').`,
  }));
const RATE_LIMIT_MESSAGE =
  'Build rate-limit bucket keys via src/lib/server/rateLimitKeys.ts (ADR-0014 shared-bucket contract).';
const RATE_LIMIT_ARGUMENT_TYPES = ['Literal', 'TemplateLiteral', 'BinaryExpression'];

// A test that cannot fail is worse than no test: it advertises coverage it does not have, and
// nothing downstream reports it — a green suite looks identical either way. These are the shapes
// a reviewer has to spot by eye, so they are lint instead. The two tiers get the same guard
// under each plugin's spelling; every entry below has a counterpart on the other side.
//
//   expect-expect              a test body with no assertion
//   no-focused-test(s)         a committed .only, which silently skips the rest of the file
//   no-disabled/skipped-test   a skip that was meant to be temporary (conditional skips are the
//                              supported way to gate a spec on the environment, so those stay)
//   no-conditional-expect      an assertion reachable only if something threw, or otherwise
//                              behind a branch that may never run. A parametrized case states
//                              its expectation as a value the table carries
//                              (`expect(shown).toBe(case.labelShown)`), narrows a union through
//                              an `asserts`-signature expect* helper, or splits into its own
//                              parametrized block — never a branch wrapped around the assertion
//   valid-expect               an expect that never reaches a matcher, so it asserts nothing
//   require-awaited-expect-poll / missing-playwright-await
//                              a retrying assertion whose promise is dropped — it passes before
//                              it has resolved, which is the failure mode expect.poll invites
//
// expect-expect reads a test that delegates to a helper as assertion-free, so the helpers have
// to be named. Both blocks key off the repo's naming convention — expectKept, expectCliFailure,
// expectNoSeriousViolations, and Vitest's own expectTypeOf — rather than an enumerated list that
// silently stops covering the next helper someone writes. The two plugins spell that differently:
// Vitest's assertFunctionNames matches globs, Playwright's matches exact strings and takes regex
// sources under a separate assertFunctionPatterns.
const ASSERTION_HELPER_PREFIX = 'expect';
// Vitest's expect takes an optional second argument describing what the assertion holds. The
// rule waves a literal one through on its own but not a computed one, and computed is what a
// parametrized assertion needs to name the case that failed —
// `expect(paths.has(asset.target), asset.target)`. Playwright's expect takes only the value
// under test, so its block keeps the default cap.
const VITEST_EXPECT_MAX_ARGS = 2;
const VACUOUS_TEST_RULES = {
  vitest: {
    'vitest/expect-expect': ['error', { assertFunctionNames: [`${ASSERTION_HELPER_PREFIX}*`] }],
    'vitest/no-focused-tests': 'error',
    'vitest/no-disabled-tests': 'error',
    'vitest/no-conditional-expect': 'error',
    'vitest/valid-expect': ['error', { maxArgs: VITEST_EXPECT_MAX_ARGS }],
    'vitest/valid-expect-in-promise': 'error',
    'vitest/require-awaited-expect-poll': 'error',
  },
  playwright: {
    'playwright/expect-expect': [
      'error',
      { assertFunctionPatterns: [`^${ASSERTION_HELPER_PREFIX}`] },
    ],
    'playwright/no-focused-test': 'error',
    'playwright/no-skipped-test': ['error', { allowConditional: true }],
    'playwright/no-conditional-expect': 'error',
    'playwright/valid-expect': 'error',
    'playwright/valid-expect-in-promise': 'error',
    'playwright/missing-playwright-await': 'error',
  },
};

// Flat config lives at the repo root (where package.json / node_modules are), but the app
// source is under web/. Type checking is owned by `npm run check` (svelte-check); ESLint runs
// without a TS program so it stays fast and tolerant of the toolchain (e.g. TypeScript majors)
// — it covers correctness/style rules and the project conventions, not type errors. The one
// deliberate exception is the scoped type-aware block near the bottom (no-floating-promises
// over web/src TS), which pays the TS-program cost for that rule alone.
export default tseslint.config(
  {
    ignores: [
      '**/.svelte-kit/',
      '**/build/',
      '**/.netlify/',
      '**/node_modules/',
      '**/.venv/',
      // Locally-generated trees that are gitignored but must be named here too: flat config
      // never consults .gitignore, so `npm run lint` fails for anyone who has run the E2E
      // suite or a worktree-isolated agent — invisible on CI, which starts from a fresh
      // checkout and runs lint in its own job.
      '**/playwright-report/',
      '**/test-results/',
      '.claude/worktrees/',
      'screenshots/',
      'android/',
      'ios/',
      'scrapbook/',
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
      'no-restricted-properties': [
        'error',
        { property: 'substr', message: 'Deprecated Annex B API — use slice().' },
      ],
      // Only @playwright/test is a declared dependency; the bare `playwright` package rides in
      // transitively and re-exports the same API, so imports of it work until an install shuffle
      // breaks them. NOTE (flat-config gotcha): a later block that configures
      // no-restricted-imports REPLACES this entry — the web/src conventions block below must
      // carry the playwright path too.
      'no-restricted-imports': [
        'error',
        {
          paths: [PLAYWRIGHT_IMPORT_RESTRICTION, ...NODE_BUILTIN_IMPORT_RESTRICTIONS],
        },
      ],
    },
  },
  {
    // Conventions the codebase already followed universally, ratified as rules so the first
    // violation fails lint instead of relying on review vigilance (ADR-0031). The set was chosen
    // empirically: candidate rules were run over the real repo and only kept where the code
    // already complied. Rejected candidates are recorded in ADR-0031 — don't re-litigate them
    // here without new evidence.
    files: ['**/*.{ts,mts,mjs,js,svelte}'],
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'no-object-constructor': 'error',
      'object-shorthand': ['error', 'properties'],
      'prefer-object-spread': 'error',
      'prefer-spread': 'error',
      'prefer-regex-literals': 'error',
      'no-useless-rename': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-unneeded-ternary': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'no-throw-literal': 'error',
      'array-callback-return': 'error',
      'default-case-last': 'error',
      'no-constructor-return': 'error',
      'guard-for-in': 'error',
      'no-labels': 'error',
      'no-sequences': 'error',
      'no-return-assign': 'error',
      'no-new-wrappers': 'error',
      'no-proto': 'error',
      radix: 'error',
      yoda: 'error',
      'symbol-description': 'error',
      'grouped-accessor-pairs': 'error',
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/consistent-indexed-object-style': 'error',
      '@typescript-eslint/unified-signatures': 'error',
      '@typescript-eslint/prefer-literal-enum-member': 'error',
      // The house convention: a pure type-only import is `import type { X }`; a statement that
      // also pulls a value marks the type inline (`import { a, type B }`). Both forms pass —
      // fixStyle only governs autofix output, and inline produces a one-token fix instead of a
      // hoisted second statement. disallowTypeAnnotations must stay false: inline
      // `import('...')` type annotations are load-bearing here (app.d.ts must not become a
      // module or `declare global` breaks; lazy-import typing; importActual type arguments).
      // With verbatimModuleSyntax on (SvelteKit's tsconfig), an unmarked type-only import is
      // emitted as a real runtime import — this rule has teeth beyond style.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
  {
    // NOT the svelte-flavoured globs: plain prefer-const reads `let x = $state()` as
    // never-reassigned (hundreds of false positives), so .svelte / .svelte.ts / .svelte.js get
    // the rune-aware svelte/prefer-const in the svelte-files block instead. This split is what
    // makes the rule adoptable at all.
    files: ['**/*.{ts,mts,mjs,js}'],
    ignores: ['**/*.svelte.ts', '**/*.svelte.js'],
    rules: { 'prefer-const': 'error' },
  },
  {
    // Rate-limit bucket keys are a shared contract (ADR-0014): every producer must go through
    // the builders in src/lib/server/rateLimitKeys.ts, so an inline string key at a call site
    // can silently fork (or collide with) a bucket. Placed BEFORE the svelte-files block on
    // purpose: that block's no-restricted-syntax (index-signature ban) replaces this one for
    // .svelte/.svelte.ts files, which is fine — rateLimit() is server-only and can't appear
    // there. The Vitest block near the bottom likewise replaces this for *.test.ts files,
    // where ad-hoc literal keys are the point.
    files: ['web/src/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RATE_LIMIT_ARGUMENT_TYPES.map((argumentType) => ({
          selector: `CallExpression[callee.name="rateLimit"][arguments.0.type="${argumentType}"]`,
          message: RATE_LIMIT_MESSAGE,
        })),
        // Merged here rather than its own web/src block, which would silently replace the
        // rate-limit selectors above (that actually happened during evaluation).
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'web/src uses named exports only — a default export gets a new name at every import site.',
        },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Misfires on `$bindable()` destructuring defaults, which read as unused assignments.
      'no-useless-assignment': 'off',
      // An index signature on a Props interface erases type checking for every forwarded
      // attribute; svelte/elements ships the accurate types for `...rest` bags.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSInterfaceDeclaration TSIndexSignature',
          message:
            'Extend HTMLAttributes<...> from svelte/elements instead of an index-signature prop bag.',
        },
      ],
      // Rune-aware replacement for prefer-const (see the split-glob block above), plus the
      // svelte-specific conventions the codebase already satisfied when ratified (ADR-0031).
      'svelte/prefer-const': 'error',
      'svelte/require-each-key': 'error',
      'svelte/block-lang': ['error', { script: ['ts'] }],
      'svelte/no-inspect': 'error',
      'svelte/prefer-svelte-reactivity': 'error',
      'svelte/no-dom-manipulating': 'error',
      'svelte/no-useless-mustaches': 'error',
      'svelte/no-useless-children-snippet': 'error',
      'svelte/shorthand-attribute': 'error',
      'svelte/shorthand-directive': 'error',
      'svelte/html-self-closing': 'error',
      'svelte/no-target-blank': 'error',
      'svelte/valid-prop-names-in-kit-pages': 'error',
      'svelte/prefer-writable-derived': 'error',
    },
  },
  {
    // Browser-console paste snippets, not Node scripts — the blanket eslint-disable at the
    // top of each file is intentional even when currently redundant.
    files: ['tools/perf/probes/*.js'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    // Plain-Node ESM tooling (no TypeScript to resolve identifiers). Re-enable no-undef here so a
    // used-but-unimported binding — e.g. dropping `import { existsSync } from 'node:fs'` while a
    // call remains — fails lint instead of throwing ReferenceError only at CLI runtime.
    files: ['tools/asset-gen/**/*.mjs'],
    rules: {
      'no-undef': 'error',
    },
  },
  {
    // Project conventions (CLAUDE.md, ADR-0002): Svelte 5 runes only — no legacy stores.
    // Flat-config rule entries replace (not merge) across blocks, so this block must include
    // the shared repo-wide playwright restriction alongside its own paths.
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
            {
              name: 'svelte',
              importNames: ['onDestroy'],
              message:
                'onDestroy runs during SSR — use an $effect cleanup (.claude/rules/svelte.md).',
            },
            PLAYWRIGHT_IMPORT_RESTRICTION,
            // web/src does import node builtins (server modules, colocated unit tests), so the
            // node: protocol restriction has to ride along here too — root coverage alone would
            // be replaced away by this block.
            ...NODE_BUILTIN_IMPORT_RESTRICTIONS,
          ],
        },
      ],
    },
  },
  {
    // Size ratchet for app + E2E code: past 500 real lines a module is overdue for the split
    // treatment engine.ts got (ADR-0004 siblings). Grandfathered outliers below carry caps just
    // above their current size so they can only shrink.
    files: ['web/src/**', 'web/tests/**'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Imperative-by-design engine facade (ADR-0004): canvas/input orchestration, brush-state
    // projection, and export-before-clear sequencing stay colocated because extracting those thin
    // seams only satisfies the counter. The explicit cap leaves maintenance room while focused
    // renderer, surface, history, and geometry modules stay split out.
    files: ['web/src/lib/drawing/engine.ts'],
    rules: {
      'max-lines': ['error', { max: 950, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Grandfathered pre-ratchet components (~625/~633 counted lines): the toolbar drawer and the
    // admin console each mix markup + scoped styles that resist extraction. Cap sits just above
    // today's size — shrink over time, never grow.
    files: [
      'web/src/lib/components/ActionsPanel.svelte',
      'web/src/lib/components/admin/AdminConsole.svelte',
    ],
    rules: {
      'max-lines': ['error', { max: 650, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Vitest files (unit + repo-script tests) — Playwright specs are *.spec.ts and keep test().
    // Mixing the vocabularies makes greps and reporter output lie about which tier a test is in.
    // This block's no-restricted-syntax deliberately replaces the web/src rateLimit-key rule:
    // unit tests construct ad-hoc literal bucket keys on purpose.
    files: ['**/*.test.ts', '**/*.test.mjs'],
    plugins: { vitest },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="test"]',
          message: 'Vitest files use it()/describe() — test() is the Playwright vocabulary.',
        },
        {
          selector: 'CallExpression[callee.object.name="test"]',
          message: 'Vitest files use it()/describe() — test() is the Playwright vocabulary.',
        },
      ],
      ...VACUOUS_TEST_RULES.vitest,
      'vitest/no-alias-methods': 'error',
      'vitest/no-commented-out-tests': 'error',
      'vitest/no-import-node-test': 'error',
      'vitest/prefer-comparison-matcher': 'error',
      'vitest/prefer-to-contain': 'error',
      'vitest/prefer-hooks-on-top': 'error',
      // The house convention is bare behavior titles, not sentence-cased "should …" prose.
      // ignoreTypeOfDescribeName keeps the parametrized-describe pattern legal — a describe()
      // over a discovered set (dev servers, workflow files) takes its name from the loop
      // variable.
      'vitest/valid-title': [
        'error',
        { disallowedWords: ['should'], ignoreTypeOfDescribeName: true },
      ],
    },
  },
  {
    // Playwright specs. Same vacuous-test guard as the Vitest block above, spelled in this
    // plugin's rule names; the two vocabularies never mix, so the globs stay disjoint.
    files: ['web/tests/**/*.spec.ts'],
    plugins: { playwright },
    rules: {
      ...VACUOUS_TEST_RULES.playwright,
      // The flake-resistance discipline docs/TESTING.md teaches, encoded: no pauses, no element
      // handles, no bare waitForSelector, web-first assertions, native locators.
      'playwright/no-page-pause': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/prefer-native-locators': 'error',
      'playwright/prefer-to-have-length': 'error',
      'playwright/no-commented-out-tests': 'error',
      'playwright/no-nested-step': 'error',
      'playwright/max-nested-describe': 'error',
      'playwright/valid-title': 'error',
      'playwright/no-get-by-title': 'error',
    },
  },
  {
    // The ONE type-aware exception to the fast non-type-aware design above: floating promises
    // in app code silently swallow rejections (a failed dynamic import, an unawaited native
    // call), and only a TS program can see a call's return type. Scoped to web/src TS so the
    // project-service cost (~seconds) stays off tooling/scripts. .svelte components are NOT
    // covered — a plain-TS project service resolves types imported from .svelte modules as
    // `any`, producing structural false positives — so a floating promise in component markup
    // (onclick={() => save()}) is out of this rule's reach; that gap is accepted, not an
    // oversight.
    files: ['web/src/**/*.ts'],
    ignores: ['**/*.d.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname + '/web',
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  prettier
);
