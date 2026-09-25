# ADR-0031: Linting, Formatting, and CI Quality Gates

**Status:** Active **Date:** 2026-06 (amended 2026-07: ignore-based file selection; markdown handed
to dprint — ADR-0057; hand-authored configuration brought into Prettier scope; amended 2026-08:
dependency audit raised from critical to high; amended 2026-09: the silently-followed conventions
ratified as rules — issue 1529; stylelint adopted for CSS and Svelte `<style>` blocks — issue 1859;
five auto-fixable notation rules adopted through one isolated reformat — issue 1861; unpinned
`:global()` selectors ratcheted — issue 1938)

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
* **An `eslint-disable` names its rules and says why** (amended 2026-09, issue 2322). Unused
  directives are errors (`linterOptions.reportUnusedDisableDirectives`, plus
  `svelte/comment-directive`'s opt-in equivalent for template comments), and the local
  `disable-directives/require-disable-reason` rule (`tools/eslint-disable-directives.mjs`) requires
  a rule list and a `--` reason. The local rule exists because
  `@eslint-community/eslint-plugin-eslint-comments` only sees script comments, and a Svelte template
  disable is where the defect lived: eslint-plugin-svelte splits a template directive's rule list on
  whitespace, so four `{@html}` disables written without `--` had been suppressing each word of
  their prose as a rule id. A disable that names no rule, or names the enforcing rule, suppresses
  the report that would flag it, so `tools/tests/disable-directives-lint.test.mjs` also runs the
  rule over the tracked source with inline config off.
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
  over every `<style>` block and hand-authored `.css` file in the repo, with **postcss-html** as the
  custom syntax. Selection is ignore-based like the rest of this ADR's file selection, and for the
  same reason: an allowlist glob scoped to `web/src` left the three hand-authored stylesheets under
  `tools/` unlinted with nothing to say so — the 2026-07 failure mode, reproduced. The exclusions
  are the generated `web/src/tokens.css` (guarded by `npm run gen:tokens:check`), build output,
  nested agent worktrees, and the promoted `scrapbook/` run outputs.

  Three implementation facts worth not rediscovering. `customSyntax` is scoped to `**/*.svelte`
  rather than set at the top level: pointed at a plain `.css` file, postcss-html parses the
  stylesheet as a document, finds no embedded style block, and reports zero problems — coverage that
  disappears without failing. Stylelint 16 removed its own stylistic rules, so nothing in the
  standard set contests Prettier's formatting (verified against stylelint 17.15, and confirmed by
  running `prettier --write` over the whole scope: it rewrites nothing and stylelint stays clean).
  And `stylelint-config-standard` is deliberately **not** a dependency — it was installed once to
  measure, then removed; the rules are enumerated with their values so that a stylelint upgrade
  cannot enable an unmeasured rule. The config also turns on `reportDescriptionlessDisables`,
  `reportNeedlessDisables` and `reportInvalidScopeDisables`, so a `stylelint-disable` has to say
  why, has to be suppressing something real, and has to name an enabled rule — the standard this ADR
  already holds the `{@html}` disables to, and without which a bare disable is the cheapest way to
  defeat any rule in the set.
* **The adopted CSS rule set — 64 rules.** Same method as the ESLint ratification above: a rule is
  enabled where the codebase already complies, and rejected with its count where it does not. 59
  were measured at zero; the other 5 reached zero through one isolated `style:` reformat (below).
  The set groups into four kinds:
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
  * **Notation and naming conventions** (22 rules) — case, quoting, zero-length units, colour and
    keyframe notation, kebab-case custom properties. 17 were already followed everywhere; the five
    adopted by reformat are listed below.

  Rules take `stylelint-config-standard` v40's own option values, several of which carry an `ignore`
  — `declaration-block-no-duplicate-properties` and `length-zero-no-unit` in particular are at zero
  *because* of theirs (13 and 12 violations without, measured over the full scope). They are the
  only two: the other four inherited ignores — on `at-rule-prelude-no-invalid`,
  `selector-type-no-unknown`, `string-no-newline` and `value-no-vendor-prefix` — are not
  load-bearing, each rule scoring zero with the ignore removed. Those are inherited rule semantics.
  Exactly **one** option is this project's own: `selector-pseudo-class-no-unknown` runs with
  `ignorePseudoClasses: ['global']`. Its 316 hits were **all** Svelte's `:global()`, which is
  scoping syntax rather than an unknown pseudo-class, and teaching the rule the framework's
  vocabulary is what this config already does for genuine idioms. At zero afterwards, it catches
  `:focus-visable` across every component — the single highest-value rule in the set.

  **The first project-owned stylelint rule** (amended 2026-09, the motion pass). The design skill's
  "one curve per cue" practice — a keyframe block with three or more transform stops plays on
  `linear` (or `ease-in-out`, when every stop is a turning point) and names each segment's curve
  inside the keyframe — is a local plugin, `tools/stylelint-keyframe-curves.mjs`, registered as
  `splotch/keyframe-curves`. It measured 16 violations; five were shakes, pulses and wiggles already
  on `ease-in-out`, which the rule accepts by design, and the remaining 11 reached zero in the
  change that enabled it, because converting them was the change. It sees one stylesheet at a time,
  so a component playing a keyframe block declared in another file is not covered.

  **`:global()` shape stays in the token ratchet, not stylelint** (amended 2026-09, issue 1938).
  Svelte's syntax is legitimate when a scoped compound pins a forwarded class, cross-component
  state, `{@html}` content, or an imperative class to its component; only a selector whose every
  compound is global has the leak-prone shape. The repository already has a non-zero per-file
  baseline for that shape, so `npm run lint:tokens` applies the same fail-above-and-below ratchet as
  raw hex and font-size values. A stylelint disallow-list would either reject the sanctioned seams
  or need per-file overrides that silently exempt new selectors, contrary to this ADR's measured
  rule-adoption policy.

* **Rejected CSS rule candidates — measured, do not re-litigate without new evidence.**
  `stylelint-config-standard` v40 enables 82 rules; 22 of them fired at the 2026-09 evaluation, and
  five of those were later adopted by reformat (below). The 17 still rejected account for 519
  violations (counts as of that evaluation): `rule-empty-line-before` 136 ·
  `media-feature-range-notation` 113 · `comment-empty-line-before` 81 · `at-rule-empty-line-before`
  45 · `no-descending-specificity` 32 · `declaration-empty-line-before` 25 ·
  `keyframes-name-pattern` 16 · `custom-property-empty-line-before` 13 · `selector-id-pattern` 13 ·
  `selector-not-notation` 9 · `property-no-vendor-prefix` 8 · `value-keyword-case` 8 ·
  `selector-class-pattern` 7 · `no-duplicate-selectors` 6 ·
  `declaration-block-no-redundant-longhand-properties` 4 · `property-no-deprecated` 2 ·
  `declaration-property-value-keyword-no-deprecated` 1. Broadening the scope to the whole repo added
  an 18th: `declaration-block-single-line-max-declarations` 61, every one of them in
  `tools/scrapbook/clear-sound-sheet/sheet.css`. Five carry a specific note:
  * The five `*-empty-line-before` rules (300 violations between them) govern blank-line placement.
    Note that nothing else governs it either: Prettier preserves the blank lines it finds in CSS
    rather than placing them, so these are not a formatter's job being defended — they are unowned.
    They are rejected because appearance at that grain is left to the author here, and because
    `stylelint --fix` would rewrite 98 files to adopt them. Not a claim that the convention is
    wrong.
  * `property-no-vendor-prefix` is not debt. Against `caniuse-lite` as installed: unprefixed
    `backdrop-filter` landed in Safari 18.0, above the Safari 16.4 floor (`docs/COMPATIBILITY.md`),
    and `user-select` **still requires the `-webkit-` prefix in every shipping Safari**, 26.x and
    Technology Preview included — WebKit's 2026-08 unprefixed parsing is inert behind a test-only
    flag. So one prefix is required until the floor moves and the other has no removal date at all.
    A linter telling a contributor to delete them would break the floor the repo publishes. The four
    sibling vendor-prefix rules (at-rule, media-feature, selector, value) are all at zero and
    adopted, so the asymmetry is deliberate rather than an oversight.
  * `keyframes-name-pattern` has no convention to ratify in either direction: the kebab-case pattern
    flags 16 camelCase names and a camelCase pattern flags 16 kebab-case ones. The codebase is
    genuinely split, and picking a side is a rename, not a ratification.
  * `no-duplicate-selectors`' 6 hits are all `:root` in `app.css`, which is sectioned by purpose on
    purpose.
  * `declaration-block-single-line-max-declarations` was briefly adopted, then rejected when the
    scope widened. Confining it with a `tools/scrapbook/**` override was the wrong instinct: a
    directory exception is the allowlist failure in a new place, silently exempting every future
    stylesheet in that tree. The rule is now rejected repo-wide with its count, which is what this
    ADR's method prescribes and what every adopted rule satisfies. Nothing is lost in practice —
    Prettier already puts one declaration per line everywhere it owns.

  **Ten of the 18 are fully `stylelint --fix`-able**, so for several of them the count *is* the
  whole reason: the policy above rejects on non-compliance, and complying would have meant a mass
  reformat of production CSS inside a linting change. The genuinely-unwanted set is small —
  `property-no-vendor-prefix` (where `--fix` would delete the prefixes the floor needs, making
  auto-fixability a hazard rather than a convenience), `keyframes-name-pattern` (no convention
  exists to ratify), `no-duplicate-selectors`, and `declaration-block-single-line-max-declarations`.
  A third group is not mechanical at all, because the fix changes behaviour:
  `no-descending-specificity` (50) reorders the cascade, `property-no-deprecated` (2) rewrites
  `clip` on visually-hidden a11y utilities, and `selector-not-notation` (9) and
  `declaration-block-no-redundant-longhand-properties` (4) are auto-fixable but change specificity
  and reset unset sub-properties respectively. Adopting any of the safe auto-fixable ones later is
  one isolated `style:` commit, the way the original Prettier reformat was isolated — not a
  re-litigation of this record.
* **Five rejected candidates adopted by reformat** (amended 2026-09, issue 1861). The rejection
  above was about not mixing a mass reformat into a linting change, not a judgement that these rules
  were wrong, so the safe, fully auto-fixable ones whose output reads better were applied as one
  `style:` commit, recorded in `.git-blame-ignore-revs`, and moved into the adopted set:
  `alpha-value-notation`, `color-function-alias-notation`, `color-function-notation`,
  `color-hex-length` and `shorthand-property-no-redundant-values`, all with
  `stylelint-config-standard` v40's own option values. The first three are one migration, and the
  form chosen is **the modern space-separated notation with a percentage alpha in colours only**:
  `rgb(0 0 0 / 60%)`, while `opacity` and the SVG `*-opacity` properties keep a plain number. That
  exception is the standard config's, and it is what separates the two counts on record — 60 colour
  alphas under it, 178 without it, the difference being `opacity: 0` and `opacity: 1` rewritten to
  `0%` and `100%`, which says nothing more and reads worse. The decimal-alpha alternative
  (`rgb(0 0 0 / 0.6)`, adopting only the two function rules) was the cheaper half and equally
  legitimate; percentage won for matching the standard config rather than carrying a local option.
  Every rewritten declaration was checked to compute to the same value in Chromium and WebKit before
  the reformat landed.

  Two facts about the fixer worth not rediscovering. A colour whose channels come from a
  comma-separated custom property — `rgba(var(--brand-rgb), 0.3)` — cannot be made modern, because
  the channel list is only known after substitution; `color-function-notation` leaves it alone, and
  `color-function-alias-notation` renames it to `rgb(var(--brand-rgb), 0.3)`, the legacy
  four-argument `rgb()` that CSS Color 4 accepts and every engine above the floor parses. Converting
  those means changing the `--*-rgb` tokens to space-separated channels, which is a token change,
  not a notation one. And `stylelint --fix` re-serialises the root it edits, which escaped a literal
  `<style>` inside `app.css`'s header comment to `\3c style>` — review a `--fix` diff for escapes,
  not only for the rules it targeted. The rest of the list stays rejected for the reasons given:
  `value-keyword-case` would lower-case `currentColor`, `media-feature-range-notation` is a
  preference with no correctness argument, and the blank-line, specificity, longhand and
  vendor-prefix rules are unchanged.

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
* \+ Every hand-authored stylesheet in the repo is linted, CSS inside Svelte `<style>` blocks for
  the first time; a misspelled media feature, pseudo-class, or property value fails CI instead of
  silently never applying.
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
