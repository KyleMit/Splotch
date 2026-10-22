import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import {
  DISABLE_DIRECTIVES_PLUGIN_NAME,
  REQUIRE_DISABLE_REASON_RULE_ID,
  disableDirectivesPlugin,
} from './tools/eslint-disable-directives.mjs';

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
// The full no-restricted-imports set for web/src. Every block that configures the rule for a
// slice of src spreads this, so the replace gotcha above can't silently drop an entry there.
// tools/tests/server-only-imports-lint.test.mjs is the positive control.
const SHARED_TYPESCRIPT_FILES = [
  'src/lib/**/*.ts',
  'netlify/server/**/*.ts',
  'tools/{icons,marketing-assets,migration,release,store-drawings}/**/*.ts',
];
const WEB_SRC_IMPORT_RESTRICTIONS = [
  PLAYWRIGHT_IMPORT_RESTRICTION,
  // src does import node builtins (server modules, colocated unit tests), so the node:
  // protocol restriction has to ride along here too — root coverage alone would be replaced away.
  ...NODE_BUILTIN_IMPORT_RESTRICTIONS,
];
// Shared client modules must not import server-only packages. The restriction covers static
// imports and re-exports; server modules live under lib/server/.
const SERVER_ONLY_PACKAGES = ['sharp', 'openai', '@netlify/blobs'];
const SERVER_ONLY_PACKAGE_MESSAGE =
  'Server-only package: import it from a module under netlify/server/ (or a +server.ts / *.server.ts file), and reach that module from server code only.';
const RATE_LIMIT_MESSAGE =
  'Build rate-limit bucket keys via netlify/server/rateLimitKeys.ts (ADR-0014 shared-bucket contract).';
const RATE_LIMIT_ARGUMENT_TYPES = ['Literal', 'TemplateLiteral', 'BinaryExpression'];

// no-restricted-syntax selectors shared across blocks. Flat config REPLACES a rule's earlier
// entry rather than merging, so every block that configures no-restricted-syntax for a slice of
// src must recompose the full set that applies there — these constants are what make that
// recomposition mechanical instead of copy-paste that drifts. The positive control
// tools/tests/named-exports-lint.test.mjs fails if a src file shape stops rejecting a
// default export.
const NAMED_EXPORTS_ONLY = {
  selector: 'ExportDefaultDeclaration',
  message: 'src uses named exports only — a default export gets a new name at every import site.',
};
// Mixing the it()/test() vocabularies makes greps and reporter output lie about which tier a
// test is in — Vitest files use it()/describe(), test() is the Playwright vocabulary.
// localStorage is a boundary the storage seam owns: keys are declared once in STORAGE_KEYS and
// reached through readString/writeString, which carry the degrade behaviour and the native
// durable mirror with them. A module touching the global directly is invisible to all three.
// An AST restriction rather than a text scan because the evasions are cheap and each one reads
// as ordinary code: localStorage['getItem'], a destructured getItem, window.localStorage. One
// Identifier selector covers every spelling, including the property half of window.localStorage.
const STORAGE_SEAM_MESSAGE =
  'Reach localStorage through src/lib/storage.ts (readString/writeString), with the key declared in STORAGE_KEYS.';
const STORAGE_SEAM_ONLY = [
  // Covers every spelling that names the global directly, including the property half of
  // window.localStorage and a destructured getItem.
  'Identifier[name="localStorage"]',
  // window['localStorage'] and globalThis['localStorage'] contain no Identifier by that name at
  // all — the string is a Literal in a computed member. Ordinary code, and invisible to the
  // selector above.
  'MemberExpression[computed=true][property.value="localStorage"]',
].map((selector) => ({ selector, message: STORAGE_SEAM_MESSAGE }));

// A media query written at a matchMedia call is a boundary string with no spell-checker behind
// it: a typo evaluates to false forever, so the accommodation silently never applies, and
// matching the correct spelling cannot catch a misspelling.
//
// What this enforces is exactly one thing: no inline literal at a matchMedia call. It does NOT
// establish that the argument came from an imported constant — a local `const QUERY = '…'`, or
// an aliased callee, still passes, because a selector cannot resolve a binding. That limit is
// accepted: issue #1863 records the decision to keep this syntax-based rule rather than add a
// scope-analysis rule plugin until a second rule needs binding resolution. The claim here is
// deliberately limited to what the selector actually checks.
const MEDIA_QUERY_LITERAL = ['Literal', 'TemplateLiteral'].flatMap((argumentType) =>
  [
    'callee.name="matchMedia"',
    'callee.property.name="matchMedia"',
    'callee.computed=true][callee.property.value="matchMedia"',
  ].map((callee) => ({
    selector: `CallExpression[${callee}][arguments.0.type="${argumentType}"]`,
    message:
      'Import the query constant (lib/platform/reducedMotion.ts, lib/breakpoints.ts, lib/theme.ts) instead of spelling a media query at the matchMedia call.',
  }))
);

// The SDK's default consistency is eventual, the mode that once made about half of all free
// generations fail to find the reservation their own request had just written (ADR-0105). So no
// Blobs store gets it by omission: every getStore call is an options object naming its mode as a
// literal, since `consistency: undefined` or an unset variable falls back to the default too. The
// positive control tools/tests/blobs-consistency-lint.test.mjs covers both shapes.
const BLOBS_CONSISTENCY_MESSAGE =
  "Call getStore({ name, consistency: 'strong' | 'eventual' }): 'strong' when a request reads its own write (ADR-0105), 'eventual' when none does (ADR-0025).";
const BLOBS_CONSISTENCY_EXPLICIT = [
  'CallExpression[callee.name="getStore"][arguments.0.type!="ObjectExpression"]',
  'CallExpression[callee.name="getStore"] > ObjectExpression.arguments:not(:has(> Property[key.name="consistency"][value.value=/^(strong|eventual)$/]))',
].map((selector) => ({ selector, message: BLOBS_CONSISTENCY_MESSAGE }));

// The full no-restricted-syntax set for src, applied by the src block and recomposed by
// every later block that adds selectors for a slice of it. Each set is merged here rather than into
// its own src block, which would silently replace the rate-limit selectors (that actually
// happened during evaluation). The Vitest block replaces this entry for its file shapes,
// then a web/src-scoped block recomposes NAMED_EXPORTS_ONLY.
const WEB_SRC_SYNTAX_RESTRICTIONS = [
  ...RATE_LIMIT_ARGUMENT_TYPES.map((argumentType) => ({
    selector: `CallExpression[callee.name="rateLimit"][arguments.0.type="${argumentType}"]`,
    message: RATE_LIMIT_MESSAGE,
  })),
  NAMED_EXPORTS_ONLY,
  ...STORAGE_SEAM_ONLY,
  ...MEDIA_QUERY_LITERAL,
  ...BLOBS_CONSISTENCY_EXPLICIT,
];

// Every /api method handler is exported as `apiHandler(...)` itself: an unwrapped one compiles and
// passes its unit tests, which call the export directly, yet sends a framework-shaped error body
// to clients that parse { ok, error } and skips the [server error] log line. The rule is stated
// in docs/API.md, .claude/rules/server-api.md, and apiHandler's doc comment; the positive control
// is tools/tests/api-handler-lint.test.mjs. A handler is flagged unless its initializer is the
// apiHandler call, so a wrapped handler exported by another name or specifier is flagged too. A
// selector matches the callee by name, not binding, so the second set pins that name to the
// http.ts import: a local or differently imported apiHandler is flagged where it is bound.
const API_HANDLER_EXEMPT_ROUTE = 'netlify/server/api/cspReport.ts';
const API_METHOD_EXPORT = '/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|fallback)$/';
const API_HANDLER_MESSAGE =
  'Export every /api method handler as apiHandler(...) from lib/server/http, so a thrown failure answers { ok:false, error } and is logged (docs/API.md). csp-report is the one exemption.';
const API_HANDLER_BINDING_MESSAGE =
  'In an /api endpoint module, apiHandler is the ../http import and nothing else, so an apiHandler(...) export is the real wrapper.';
const API_HANDLER_WRAPPED = [
  ...[
    `ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=${API_METHOD_EXPORT}]:not([init.type="CallExpression"][init.callee.name="apiHandler"])`,
    `ExportNamedDeclaration > FunctionDeclaration[id.name=${API_METHOD_EXPORT}]`,
    `ExportSpecifier[exported.name=${API_METHOD_EXPORT}]`,
  ].map((selector) => ({ selector, message: API_HANDLER_MESSAGE })),
  ...[
    'ImportDeclaration[source.value!="../http"] > ImportSpecifier[local.name="apiHandler"]',
    'ImportSpecifier[local.name="apiHandler"][imported.name!="apiHandler"]',
    ':matches(ImportDefaultSpecifier, ImportNamespaceSpecifier)[local.name="apiHandler"]',
    ':matches(VariableDeclarator, FunctionDeclaration, ClassDeclaration)[id.name="apiHandler"]',
    'ObjectPattern > Property[value.name="apiHandler"]',
    'ArrayPattern > Identifier[name="apiHandler"]',
    'AssignmentPattern[left.name="apiHandler"]',
    'RestElement[argument.name="apiHandler"]',
  ].map((selector) => ({ selector, message: API_HANDLER_BINDING_MESSAGE })),
];

const VITEST_VOCABULARY_SELECTORS = [
  'CallExpression[callee.name="test"]',
  'CallExpression[callee.object.name="test"]',
].map((selector) => ({
  selector,
  message: 'Vitest files use it()/describe() — test() is the Playwright vocabulary.',
}));

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
// The Playwright rules that judge an assertion's own shape rather than the test around it. The
// shared E2E helpers hold assertions but define no tests, so they get only these.
const PLAYWRIGHT_ASSERTION_SHAPE_RULES = {
  'playwright/valid-expect': 'error',
  'playwright/valid-expect-in-promise': 'error',
  'playwright/missing-playwright-await': 'error',
};
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
    ...PLAYWRIGHT_ASSERTION_SHAPE_RULES,
  },
};

// tools/ files over the default max-lines cap, each capped at its own real-line count so it can
// shrink but not grow: growth means cutting lines elsewhere in the file or raising its number here,
// in a diff a reviewer sees. Unlike the web overrides, whose caps carry a reviewed WHY and headroom,
// none of these has been reviewed for a split. The burn-down-oversized-code skill lists each one as
// a candidate, and its split-or-raise review is what retires an entry or turns it into a web-style
// override block.
const TOOLS_GRANDFATHERED_MAX_LINES = {
  'tools/api-smoke/run-local-contract.mjs': 548,
  'tools/audit-burndown/run-burndown.mjs': 755,
  'tools/audit-burndown/tests/burndown-core.test.mjs': 655,
  'tools/e2e-tuning/gen-tuning-report.mjs': 860,
  'tools/model-eval/gen-model-inputs.mjs': 510,
  'tools/model-eval/lib/composition-score.mjs': 627,
  'tools/model-eval/lib/model-eval-report.mjs': 759,
  'tools/page-inventory/capture-page-inventory.mjs': 1023,
  'tools/page-inventory/lib/page-inventory-report.mjs': 557,
  'tools/page-inventory/tests/page-inventory.test.mjs': 928,
  'tools/scrapbook/clear-sound-sheet/sheet.js': 1716,
  'tools/scrapbook/lib/scrapbook-index.mjs': 738,
  'tools/scrapbook/proof-sheet-hub-assets/proof-sheet-hub.client.js': 571,
  'tools/tests/bootstrap-worktree.test.mjs': 643,
  'tools/tests/codex-transcript-tools.test.mjs': 503,
  'tools/tests/fetch-image-reports.test.mjs': 568,
};

// Flat config lives at the repo root (where package.json / node_modules are), but the app
// source is under web/. Type checking is owned by `npm run check`; ESLint runs
// without a TS program so it stays fast and tolerant of the toolchain (e.g. TypeScript majors)
// — it covers correctness/style rules and the project conventions, not type errors. The one
// deliberate exception is no-floating-promises, run type-aware by two scoped blocks near the
// bottom (src TS and the native candidate's src), which pay the TS-program cost for that rule
// alone.
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
      // The React Native web export (`npm run native:web:build`): bundled Expo output.
      'dist/',
      'tools/icons/lib/icon-names.d.ts',
      'src/lib/releases.json',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // TypeScript already resolves identifiers (including compile-time
      // constants like __APP_VERSION__), so ESLint's own undefined/unused checks only add noise.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Empty catch blocks are how the engine ignores best-effort pointer-capture calls.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-restricted-properties': [
        'error',
        { property: 'substr', message: 'Deprecated Annex B API — use slice().' },
      ],
      // Only @playwright/test is a declared dependency; the bare `playwright` package rides in
      // transitively and re-exports the same API, so imports of it work until an install shuffle
      // breaks them. NOTE (flat-config gotcha): a later block that configures
      // no-restricted-imports REPLACES this entry — the src conventions block below must
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
    files: ['**/*.{ts,mts,mjs,js}', '**/*.{tsx,cjs}'],
    plugins: { [DISABLE_DIRECTIVES_PLUGIN_NAME]: disableDirectivesPlugin },
    rules: {
      // A suppression names its rules and says why, and one that suppresses nothing fails —
      // the eslint-disable counterpart of stylelint.config.js's disable reporting.
      [REQUIRE_DISABLE_REASON_RULE_ID]: 'error',
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
      // With verbatimModuleSyntax on, an unmarked type-only import is
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
    files: ['**/*.{ts,mts,mjs,js}', '**/*.{tsx,cjs}'],
    rules: { 'prefer-const': 'error' },
  },
  {
    // Rate-limit bucket keys are a shared contract (ADR-0014): every producer must go through
    // the builders in netlify/server/rateLimitKeys.ts, so an inline string key at a call site
    // can silently fork (or collide with) a bucket. Unit tests can use literal keys as fixtures.
    files: SHARED_TYPESCRIPT_FILES,
    rules: { 'no-restricted-syntax': ['error', ...WEB_SRC_SYNTAX_RESTRICTIONS] },
  },
  {
    // Adds the apiHandler guard to the /api endpoint modules (each served by a
    // netlify/functions/api.ts function). Recomposes the whole src set, which this block's
    // entry would otherwise replace for these files.
    files: ['netlify/server/api/*.ts'],
    ignores: [API_HANDLER_EXEMPT_ROUTE, '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...WEB_SRC_SYNTAX_RESTRICTIONS, ...API_HANDLER_WRAPPED],
    },
  },
  {
    // No TypeScript program covers tools/ or the skill-package scripts — neither the scripts nor
    // the .ts modules Node runs through type stripping — so nothing else resolves their
    // identifiers. Re-enable no-undef here so a used-but-unimported binding — e.g. dropping
    // `import { existsSync } from 'node:fs'` while a call remains — fails lint instead of throwing
    // ReferenceError only when someone runs the script (for a device capture, mid-campaign on a
    // physical device, or when an agent runs a skill). The shared browser + Node globals are the
    // right set: Node scripts carry page.evaluate() callbacks that read window and document, and
    // the page-side probes and generated-page clients are browser scripts. A glob that narrows
    // fails tools/tests/tools-no-undef-lint.test.mjs.
    files: [
      'tools/**/*.{mjs,js,ts}',
      '.ruler/skills/**/*.mjs',
      '.ruler/skill-forks/**/*.mjs',
      '.claude/skills/**/*.mjs',
      '.agents/skills/**/*.mjs',
    ],
    rules: {
      'no-undef': 'error',
    },
  },
  {
    // Flat-config rule entries replace (not merge) across blocks, so this block must include
    // the shared repo-wide playwright restriction alongside its own paths.
    files: ['src/**/*.ts', 'netlify/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: WEB_SRC_IMPORT_RESTRICTIONS }],
    },
  },
  {
    // Server-only packages stay behind the server boundary. Replaces the block above for
    // everything outside the server paths and tests, so it recomposes that block's full list.
    files: ['src/**/*.ts', 'netlify/server/**/*.ts'],
    ignores: ['netlify/server/**', 'src/**/+server.ts', 'src/**/*.server.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...WEB_SRC_IMPORT_RESTRICTIONS,
            ...SERVER_ONLY_PACKAGES.map((name) => ({ name, message: SERVER_ONLY_PACKAGE_MESSAGE })),
          ],
          patterns: [
            {
              group: SERVER_ONLY_PACKAGES.map((name) => `${name}/*`),
              message: SERVER_ONLY_PACKAGE_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // `!` is a cast to non-null, and casts belong only at a validated boundary (CLAUDE.md,
    // "`as` is a boundary tool"). Scoped to shipped code: tests and the *TestHarness modules
    // use `!` as the idiomatic "the fixture guarantees it", and would carry ~420 disables.
    // ADR-0031 records the measured adoption.
    files: SHARED_TYPESCRIPT_FILES,
    ignores: ['**/*.test.ts', '**/*TestHarness.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'error' },
  },
  {
    // Size ratchet for app, E2E, and tools code: past 500 real lines a module is overdue for the
    // split treatment engine.ts got (ADR-0004 siblings). Outliers carry per-file caps below: the web
    // overrides each state why the file stays whole, and TOOLS_GRANDFATHERED_MAX_LINES freezes the
    // tools/ outliers at their size so they can only shrink. The burn-down-oversized-code skill's
    // measure.mjs reads this block as the one default scope, so tools/ shares it rather than taking
    // its own. Excluded: generated pointer-instruction data and the frozen ideas-exploration
    // archive.
    files: ['src/**', 'e2e/**', 'tools/**/*.{mjs,js,ts}', '**/*.{ts,tsx,cjs}'],
    ignores: ['tools/store-drawings/generated/**', 'tools/asset-gen/ideas-exploration/**'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  ...Object.entries(TOOLS_GRANDFATHERED_MAX_LINES).map(([path, max]) => ({
    files: [path],
    rules: { 'max-lines': ['error', { max, skipBlankLines: true, skipComments: true }] },
  })),
  {
    // Function-size ratchet for app code: 125 real lines is the hard cap; 100 is the soft target
    // refactor campaigns pay down to. A function over 100 whose code does not separate cleanly
    // gets a per-file cap below at its length + 25, with the WHY, rather than a counter-driven
    // split. Tests are excluded because they are mostly describe() callbacks.
    files: ['src/**/*.ts', 'src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 125, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  {
    // What remains in createPWAUpdates is the updateReload state machine, whose transitions read and write the same reload and registration state; the stateless and self-owning pieces are already module-scope helpers and sub-factories.
    files: ['src/lib/pwa/updates.ts'],
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 147, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },
  {
    // Vitest files (unit + repo-script tests) — Playwright specs are *.spec.ts and keep test().
    // Mixing the vocabularies makes greps and reporter output lie about which tier a test is in.
    // This block's no-restricted-syntax deliberately replaces the src rateLimit-key rule:
    // unit tests construct ad-hoc literal bucket keys on purpose.
    files: ['**/*.test.ts', '**/*.test.mjs'],
    plugins: { vitest },
    rules: {
      'no-restricted-syntax': ['error', ...VITEST_VOCABULARY_SELECTORS],
      ...VACUOUS_TEST_RULES.vitest,
      'vitest/no-alias-methods': 'error',
      'vitest/no-commented-out-tests': 'error',
      'vitest/no-import-node-test': 'error',
      'vitest/prefer-comparison-matcher': 'error',
      'vitest/prefer-to-contain': 'error',
      'vitest/prefer-hooks-on-top': 'error',
      // The house convention is bare behavior titles, not sentence-cased "should …" prose. The
      // parametrized-describe pattern — a describe() over a discovered set taking its name from
      // the loop variable — gets a justified per-line disable at each site instead of
      // ignoreTypeOfDescribeName, which would wave through every non-string title repo-wide
      // (even an accidental object literal).
      'vitest/valid-title': ['error', { disallowedWords: ['should'] }],
    },
  },
  {
    // The Vitest block above replaces no-restricted-syntax for test files, which would silently
    // exempt src's colocated unit tests from the named-exports ban — recompose the full
    // effective set for that slice. (The rate-limit selectors stay deliberately absent: ad-hoc
    // literal bucket keys are the point of a unit test.)
    files: ['src/**/*.test.ts', 'netlify/server/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...VITEST_VOCABULARY_SELECTORS, NAMED_EXPORTS_ONLY],
    },
  },
  {
    // Playwright specs. Same vacuous-test guard as the Vitest block above, spelled in this
    // plugin's rule names; the two vocabularies never mix, so the globs stay disjoint.
    files: ['e2e/specs/**/*.spec.ts'],
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
    // The shared E2E helpers hold the retrying opens every spec leans on, so a dropped await
    // inside one goes vacuous in every caller. expect-expect and no-conditional-expect judge a
    // test, and a helper is not one.
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/specs/**/*.spec.ts'],
    plugins: { playwright },
    rules: PLAYWRIGHT_ASSERTION_SHAPE_RULES,
  },
  {
    // A *TestHarness module is imported by the *.test.ts files that share it and can define it()
    // blocks of its own (describePolicyRevisions), so it gets the whole vacuous-test set.
    files: ['src/**/*TestHarness.ts', 'netlify/server/**/*TestHarness.ts'],
    plugins: { vitest },
    rules: VACUOUS_TEST_RULES.vitest,
  },
  {
    // The type-aware exception to the fast non-type-aware design above: floating promises
    // in app code silently swallow rejections (a failed dynamic import, an unawaited native
    // call), and only a TS program can see a call's return type. Scoped to src TS so the
    // project-service cost stays off tooling/scripts.
    files: [
      'src/lib/**/*.ts',
      'netlify/server/**/*.ts',
      'tools/{icons,marketing-assets,migration,release,store-drawings}/**/*.ts',
    ],
    ignores: ['**/*.d.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.shared.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // The same rule over the native candidate, against its own tsconfig. Expo SDK 58 made
    // File.write() return a promise, and ten unawaited calls verified or moved files before their
    // bytes landed (issue 3062). tools/tests/native-floating-promises-lint.test.mjs is the
    // positive control.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts', 'src/lib/**'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname + '/.',
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // Released Metro/Babel configuration and the Node transform witness use CommonJS loaders.
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/**'],
    rules: {
      'no-restricted-syntax': ['error', NAMED_EXPORTS_ONLY],
    },
  },
  {
    // The two classic hooks rules only: the plugin's recommended preset also enables the React
    // Compiler's rules, which judge code against a compiler the candidate does not run.
    // tools/tests/native-react-hooks-lint.test.mjs is the positive control.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  prettier
);
