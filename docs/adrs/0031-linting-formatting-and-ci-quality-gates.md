# ADR-0031: Linting, Formatting, and CI Quality Gates

**Status:** Active **Date:** 2026-06 (amended 2026-07: ignore-based file selection; markdown handed
to dprint — ADR-0057; hand-authored configuration brought into Prettier scope; amended 2026-08:
dependency audit raised from critical to high; amended 2026-09: the silently-followed conventions
ratified as rules — issue 1529; stylelint adopted for CSS and Svelte `<style>` blocks — issue 1859)

## Context

Splotch enforced its conventions (Svelte 5 runes only and no legacy stores — ADR-0002; TypeScript
everywhere — ADR-0003; cross-platform scripts — ADR-0017) by review vigilance alone. There was no
linter or formatter, and CI (`.github/workflows/test.yml`) ran the unit + E2E tests but never
type-checked, so a `svelte-check` regression could land on `main`. `docs/BACKLOG.md` explicitly
asked whether to "add a linter or formatter". As an AI-assisted codebase, the cost of an
inconsistency slipping through is higher than usual, and the conventions are exactly the kind a
machine can enforce cheaply.

## Decision

Adopt **ESLint** (flat config) + **Prettier**, plus a CI `quality` job, with these deliberate
choices:

* **ESLint runs without a TypeScript program.** `svelte-check` (`npm run check`) already owns type
  checking; ESLint uses `typescript-eslint` + `eslint-plugin-svelte` in their non-type-checked
  modes. This keeps lint fast and tolerant of the toolchain (notably TypeScript 6, ahead of
  typescript-eslint's official support window) — type errors are not ESLint's job.
* **Conventions are encoded as rules where lintable.** `no-restricted-imports` bans `svelte/store`
  (the runes-only rule, ADR-0002). A few rules are relaxed for genuine framework idioms rather than
  worked around in source: empty `catch` is allowed (best-effort pointer-capture calls in the
  engine), bare member reads inside `$effect` (reactive dependency tracking) are allowed, and
  `svelte/no-navigation-without-resolve` is off (the app has no base path). Intentional `{@html}`
  (first-party icons / build-time Markdown) carries a justified per-line disable so the security
  rule keeps its value elsewhere.
* **The silently-followed conventions are ratified as rules** (amended 2026-09, issue 1529).
  Selection was empirical, not aspirational: ~120 candidate rules were layered onto the real config
  and run over the repo, and only those the codebase already satisfied were kept — ~70 rules, with
  the small residue (13 violations) fixed in the adopting change. The headline invariants that had
  been protected by nothing: zero `any` (`@typescript-eslint/no-explicit-any`), no committed
  `$inspect` (`svelte/no-inspect`), no plain `Map`/`Set`/`Date` in reactive state
  (`svelte/prefer-svelte-reactivity`), the `node:` protocol on builtin imports, named exports only
  under `web/src`, and the Playwright flake-resistance rules that encode `docs/TESTING.md`'s
  spec-authoring discipline. Two adoption traps live as comments in `eslint.config.js`: plain
  `prefer-const` must exclude Svelte-flavoured files in favour of the rune-aware
  `svelte/prefer-const` (it reads `let x = $state()` as never-reassigned — a naive single glob
  produces hundreds of false positives and makes the rule look unadoptable), and because a later
  flat-config block **replaces** a rule's earlier entry, additions to `no-restricted-imports` /
  `no-restricted-syntax` must be merged into every existing entry for those rules. In the same
  change, `!important` joined `npm run lint:tokens` as a zero-tolerance check and test-file
  placement (`.test.ts` colocated under `web/src`, `.spec.ts` in `web/tests`) gained the drift guard
  `tools/tests/test-file-placement.test.mjs`. Naming conventions stay prose-only on purpose:
  PascalCase component files, camelCase lib modules, and dot-joined multi-aspect test names have no
  worthwhile lint spelling.
* **Rejected rule candidates — measured, do not re-litigate without new evidence.** Same verdict as
  the `no-magic-numbers` rejection (~750 hits): each of these carries a violation count showing the
  codebase deliberately follows a different convention (counts as of the 2026-09 evaluation):
  `vitest/prefer-strict-equal` 1062 · `no-plusplus` 933 · `no-await-in-loop` 874 ·
  `svelte/consistent-selector-style` 848 · `playwright/no-raw-locators` 803 ·
  `svelte/sort-attributes` 688 · `prefer-named-capture-group` 480 · `no-continue` 447 ·
  `no-underscore-dangle` 411 · `require-await` 334 · `@typescript-eslint/no-empty-function` 304 ·
  `@typescript-eslint/no-non-null-assertion` 276 (mostly tests) · `curly` 225 ·
  `svelte/no-unused-class-name` 151 · `prefer-template` 109 · `no-shadow` 105 ·
  `no-implicit-coercion` 105 · `svelte/no-inline-styles` 97 · `consistent-return` 46. Three carry a
  specific note: `prefer-lowercase-title` looks adoptable (its few flagged titles are all proper
  nouns and identifiers) but the real convention is "no sentence-casing", which `valid-title` with
  `disallowedWords: ['should']` captures instead; `no-extend-native` has exactly 2 hits, both
  deliberate `page.addInitScript` instrumentation in `web/tests/flows-settings.spec.ts` — if ever
  adopted, use the justified per-line disable pattern the config already uses for `{@html}`; and
  `@typescript-eslint/consistent-type-definitions` is a genuine coin flip (`interface` 257 vs `type`
  264 at evaluation) — a decision to make someday, not a convention to ratify, and deliberately out
  of scope.
* **Stylelint owns the CSS the other tools cannot see** (amended 2026-09, issue 1859). ESLint parses
  Svelte components but not the CSS inside their `<style>` blocks, so until now the only CSS checks
  in CI were the four hand-rolled by `npm run lint:tokens` (ADR-0071) — which exists because CSS
  checks were wanted and there was no linter to host them. `npm run lint:css` runs **stylelint**
  over every `<style>` block and hand-authored `.css` file under `web/src`, with **postcss-html** as
  the custom syntax. Scope excludes the generated `web/src/tokens.css`, which
  `npm run gen:tokens:check` already guards.

  Three implementation facts worth not rediscovering. `customSyntax` is scoped to `**/*.svelte`
  rather than set at the top level: pointed at a plain `.css` file, postcss-html parses the
  stylesheet as a document, finds no embedded style block, and reports zero problems — coverage that
  disappears without failing. Stylelint 16 removed its own stylistic rules, so nothing in the
  standard set contests Prettier's formatting (verified against stylelint 17.15, and confirmed by
  running `prettier --write` over the whole scope: it rewrites nothing and stylelint stays clean).
  And `stylelint-config-standard` is deliberately **not** a dependency — it was installed once to
  measure, then removed; the rules are enumerated with their values so that a stylelint upgrade
  cannot enable an unmeasured rule.
* **The adopted CSS rule set — 60 rules, each measured at zero.** Same method as the ESLint
  ratification above: a rule is enabled where the codebase already complies, and rejected with its
  count where it does not. The set groups into four kinds:
  * **CSS that is retained but dead** (25 rules) — `media-feature-name-no-unknown`,
    `property-no-unknown`, `selector-pseudo-class-no-unknown`,
    `declaration-property-value-no-unknown` and the rest of the no-unknown / no-invalid family.
    These share a failure mode issue 1854 established empirically:
    `@media (prefers-reduced-motoin: reduce)` survives in `cssRules`, reports unmatched, and its
    declarations simply never apply. A misspelled *property* is dropped and looks wrong on first
    render; a misspelled media feature, pseudo-class, at-rule prelude or value is indistinguishable
    from correct code unless you happen to be developing in the state it guards.
  * **CSS that applies and does nothing** (11 rules) — empty blocks, duplicate declarations the
    cascade discards, longhands a later shorthand overwrites, `!important` inside a keyframe.
  * **Deprecated and vendor-prefixed syntax** (6 rules), in the four categories at zero.
  * **Notation and naming conventions already followed everywhere** (18 rules) — case, quoting,
    zero-length units, colour and keyframe notation, kebab-case custom properties.

  One rule carries an option rather than a plain `true`: `selector-pseudo-class-no-unknown` runs
  with `ignorePseudoClasses: ['global']`. Its 316 hits were **all** Svelte's `:global()`, which is
  scoping syntax rather than an unknown pseudo-class, and teaching the rule the framework's
  vocabulary is what this config already does for genuine idioms. At zero afterwards, it catches
  `:focus-visable` across every component — the single highest-value rule in the set.
* **Rejected CSS rule candidates — measured, do not re-litigate without new evidence.**
  `stylelint-config-standard` v40 enables 82 rules; 22 of them fire here, for 703 violations (counts
  as of the 2026-09 evaluation): `rule-empty-line-before` 136 · `media-feature-range-notation` 113 ·
  `comment-empty-line-before` 81 · `color-function-alias-notation` 71 · `alpha-value-notation` 47 ·
  `color-function-notation` 47 · `at-rule-empty-line-before` 45 · `no-descending-specificity` 32 ·
  `declaration-empty-line-before` 25 · `shorthand-property-no-redundant-values` 18 ·
  `keyframes-name-pattern` 16 · `custom-property-empty-line-before` 13 · `selector-id-pattern` 13 ·
  `selector-not-notation` 9 · `property-no-vendor-prefix` 8 · `value-keyword-case` 8 ·
  `selector-class-pattern` 7 · `no-duplicate-selectors` 6 ·
  `declaration-block-no-redundant-longhand-properties` 4 · `property-no-deprecated` 2 ·
  `color-hex-length` 1 · `declaration-property-value-keyword-no-deprecated` 1. Five carry a specific
  note:
  * The five `*-empty-line-before` rules (300 violations between them) govern blank-line placement,
    which ADR-0057's split hands to the formatter. Rejected as a class, not on count.
  * `property-no-vendor-prefix` is not debt. At the Safari 16.4 floor (`docs/COMPATIBILITY.md`),
    `-webkit-backdrop-filter` and `-webkit-user-select` are the only spellings that work —
    unprefixed `backdrop-filter` landed in Safari 18 and `user-select` in Safari 17. A linter
    telling a contributor to delete them would break the floor the repo publishes. The four sibling
    vendor-prefix rules (at-rule, media-feature, selector, value) are all at zero and adopted, so
    the asymmetry is deliberate rather than an oversight.
  * `keyframes-name-pattern` has no convention to ratify in either direction: the kebab-case pattern
    flags 16 camelCase names and a camelCase pattern flags 16 kebab-case ones. The codebase is
    genuinely split, and picking a side is a rename, not a ratification.
  * `no-duplicate-selectors`' 6 hits are all `:root` in `app.css`, which is sectioned by purpose on
    purpose.
  * `color-function-notation` 47, `color-function-alias-notation` 71 and `alpha-value-notation` 47
    are one migration, not three — the modern `rgb(0 0 0 / 60%)` space-separated form. Worth doing
    someday as its own change; not a linting decision.

  Deliberately out of scope: consolidating the four checks `npm run lint:tokens` hand-rolls into
  stylelint. Some are expressible there, but the token linter's per-file ratchet baselines are not,
  and moving them is its own decision.
* **Prettier matches the existing style** (2-space, single-quote, width 100, `trailingComma: es5`).
  Adopting it meant a one-time reformat of `web/src` and `scripts`; hand-authored JSON, YAML, and
  web manifests are also in scope. Markdown is dprint's (ADR-0057), while generated and frozen
  artifacts are explicitly ignored.
* **File selection is ignore-based, not allowlist-based** (amended 2026-07). The scripts are just
  `eslint .` and `prettier --check .`; what to skip lives in the `ignores` block of
  `eslint.config.js` and in `.prettierignore` (Prettier 3 also respects `.gitignore`). The original
  inline package.json globs were an allowlist, and its failure mode is silent: `web/tests/`, the
  `web/` root configs, and `web/src/app.html` sat unchecked until an unrelated CI failure exposed
  them. With inversion, a new directory or file type is covered by default and an unwanted one fails
  loudly until ignored — the right default for an AI-assisted codebase. Hand-authored JSON, YAML,
  and web manifests are covered; generated and frozen artifacts receive narrow path exclusions.
  (`*.md` stays ignored permanently: markdown is formatted by dprint instead, because Prettier
  cannot produce the house bullet/emphasis style — ADR-0057.)
* **Enforcement is CI-only — no pre-commit hook.** No husky/lint-staged: it avoids an extra install
  step and an `install`-time `prepare` script, and keeps the local loop friction-free. The `quality`
  job is the gate.
* **The dependency-audit gate is `high`.** The original critical-only threshold accommodated a large
  pre-existing transitive advisory count under npm (ADR-0029). Dependency upgrades and the pnpm
  migration (ADR-0119) cleared that constraint, so high and critical advisories now block CI.
  Advisory-specific exceptions require evidence that the installed path is both unfixable and
  non-exploitable here; severity-wide or dependency-class exclusions are not part of the policy. The
  only sanctioned mechanism is an exact GHSA in pnpm's `auditConfig.ignoreGhsas`, accompanied in the
  same change by a record under **Active dependency-audit status and exceptions** in
  `docs/DEPENDENCIES.md`. The record names the locked dependency paths, upstream proof that no
  patched resolution exists, repository-specific reachability evidence, approver and approval date,
  a review-by date no more than 90 days later, and the removal trigger. The tool policy test rejects
  every audit ignore today; a future exception must extend it to require exact agreement between the
  configured GHSA set and unexpired evidence records. Lowering the threshold, ignoring a CVE family,
  `--ignore-unfixable`, and `--ignore-registry-errors` are not exception mechanisms.
* **`precheck` runs `svelte-kit sync`** so `npm run check` generates `.svelte-kit/tsconfig.json` and
  works standalone in CI (mirrors `predev`).

New scripts: `lint`, `lint:fix`, `format`, `format:check` (with `scripts-info` entries, ADR-0019).
The `quality` job runs type-check + lint + format:check + audit on every push/PR, parallel to the
existing `test` job.

## Consequences

* \+ The runes-only / no-legacy-store rule and formatting are now enforced mechanically, not by
  reviewer memory — the question `BACKLOG.md` raised is resolved.
* \+ CI type-checks every change; a `svelte-check` regression can no longer reach `main`.
* \+ Splitting ESLint (style/correctness) from svelte-check (types) keeps linting fast and immune to
  TypeScript-version skew with typescript-eslint.
* − A one-time Prettier reformat touched most source files; future `git blame` crosses that commit
  (isolated as a single `style:` commit to make it skippable).
* \+ The near-universal conventions (zero `any`, `node:` imports, named exports under `web/src`,
  rune-aware `prefer-const`, flake-resistant spec shapes, no `!important`) fail CI on their first
  violation instead of relying on a reviewer noticing.
* \+ CSS inside Svelte `<style>` blocks is linted for the first time; a misspelled media feature,
  pseudo-class, or property value fails CI instead of silently never applying.
* − The stylelint rule set is a ratchet against today's codebase, so a genuinely new construct can
  fail the gate (a future `-webkit-` value, a `@container` name that isn't kebab-case). The fix is
  to change the rule with a reason, the way the vendor-prefix asymmetry above is recorded — not to
  add an inline disable.
* − Adding stylelint re-keyed pnpm's peer-suffixed lockfile entries tree-wide, because it pulls
  `supports-color@10` where most of the tree had resolved `@7`. No dependency changed version; the
  diff is noise inherent to pnpm's peer hashing.
* \+ High and critical dependency advisories block changes before merge.
* − Moderate and low advisories remain visible in audit output but do not block CI.
* − No pre-commit hook means a contributor can commit lint/format violations locally; CI catches
  them, at the cost of a round-trip. Run `npm run lint` and `npm run format` (or `lint:fix`) before
  pushing.
* − The eslint `ignores` block and `.prettierignore` are near-duplicate lists that must be kept in
  sync by hand; neither tool can read the other's format, and a generation step wasn't worth the
  machinery for ~10 lines.
