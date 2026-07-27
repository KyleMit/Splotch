# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — scripts · root build/dev drivers

## Source: Code audit — scripts · perf profiling harness

## Source: Code audit — scripts · lib shared helpers

## Source: Code audit — web/tests · E2E + integration specs

## Source: Code audit — web · build/test configuration

## Source: Code audit — Native shells (android + ios + fastlane)

## Source: Code audit — .claude / .codex config (hooks, rules, settings)

## Source: Code audit — .github CI workflows

### [P4][naming] Redundant workflow/job naming: workflow "Tests" contains a job named "Tests"

**File(s):** `.github/workflows/test.yml:1` (`name: Tests`), `:84-85` (job `test`, `name: Tests`) —
pinned at SHA f934d43

#### Problem

The workflow is named `Tests` and its second job is also displayed as `Tests`, so the GitHub checks
list shows `Tests / Tests` alongside `Tests / Quality`. The `test.yml` file actually runs a
`quality` gate (type-check, lint, format, SVG/ruler/token/asset/scrapbook drift, `npm audit`) plus
the test suites — the filename and workflow name undersell that it's the whole push/PR gate.
`Tests / Tests` is a poor, un-scannable check name.

#### Problem grepability

Someone searching required-status-check config for "the CI gate" sees `Tests / Quality` and
`Tests / Tests` and can't tell what the second covers (unit + asset + E2E + driver smoke).

#### Proposed solution

Rename the second job's display name to something distinct (`Unit & E2E`, `Test suites`), or rename
the workflow to `CI` so the checks read `CI / Quality` and `CI / Tests`. Keep the filename or rename
to `ci.yml` for grepability.

#### Verification

The GitHub checks list shows two distinctly-named jobs; branch-protection required checks still
resolve.

---

### [P5][dead-config] `label-sync` comment references toggling `dry-run` that is already off

**File(s):** `.github/workflows/label-sync.yml:7-8` and `:28-30` — pinned at SHA f934d43

#### Problem

The header comment says "flip dry-run off / skip-delete as needed for a full sync," but the workflow
already sets `dry-run: false` (line 29). The comment describes a state that doesn't match the
config, so a reader has to reconcile "flip it off" against "it's already off." Minor staleness on an
otherwise well-documented file.

#### Proposed solution

Reword to reflect reality: dry-run is off (it does apply changes); the knob left conservative is
`skip-delete: true` (won't prune hand-made labels) — flip that to `false` for a full reconcile.

#### Verification

The comment matches the actual `dry-run`/`skip-delete` values.

---

### [P5][consistency] Repo owner casing is inconsistent across `.github` URLs (`kylemit` vs `KyleMit`)

**File(s):** `.github/ISSUE_TEMPLATE/config.yml:7` (`github.com/kylemit/splotch/...`),
`.github/workflows/pages.yml:3` (`kylemit.github.io/Splotch/`),
`.github/workflows/label-to-todo.yml:24` and `:26` (`KyleMit`) — pinned at SHA f934d43

#### Problem

The owner is written `kylemit` in the issue-template contact link and the Pages comment, but
`KyleMit` in `label-to-todo.yml` (both the comment URL and `PROJECT_OWNER: KyleMit`). GitHub
redirects are case-insensitive so nothing breaks, but the inconsistency is a papercut and, for
`PROJECT_OWNER`, the GraphQL `repositoryOwner(login:)` lookup is a value that should match the
canonical casing exactly to avoid a surprise if lookups ever tighten.

#### Proposed solution

Pick the canonical casing (the account displays as `KyleMit`) and normalize all `.github` references
to it, including the `config.yml` contact link and the `pages.yml` comment.

#### Verification

`grep -rin "kylemit" .github` shows one consistent casing; the `label-to-todo` GraphQL owner lookup
still resolves.

---

### [P5][maintainability] Issue templates use legacy Markdown format instead of validated Issue Forms

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, `task.md` — pinned at SHA
f934d43

#### Problem

All three templates are the old Markdown-with-front-matter format. Their prompts (Steps to
Reproduce, Device Information, checkboxes) are free text a reporter can delete wholesale, so nothing
is enforced — combined with the P1 label mismatch, an issue can arrive with no structure and a wrong
label. GitHub Issue Forms (`.yml`) enforce required fields, dropdowns (e.g. device OS, target-user),
and reliably-applied labels.

#### Proposed solution

Convert to Issue Forms (`bug_report.yml`, `feature_request.yml`) with `required:` fields and
`labels:` set to the correct `type:*` taxonomy values. This solves the P1 label bug and the
structure gap together. Keep `task.md`/`blank` for free-form chores if desired.

#### Verification

Opening a bug via the form requires the key fields and applies `type:bug`; `config.yml`
`blank_issues_enabled` still allows an escape hatch.

---

## Summary

23 findings. The two P1s are correctness/security: issue templates apply labels outside the
declarative taxonomy (mislabeling every templated bug/feature and defeating `type:*` automation),
and four workflows run with an unscoped default token. The P2 cluster is the classic CI-hygiene set
— one duplicated checkout/setup/`npm ci` preamble to extract into a composite action, a hard-coded
Node `24` in five places (that disagrees with the docs), CI rebuilding the APK inline instead of
calling `npm run android:apk` (violating the ADR-0017 gradle-helper convention), a stray
`checkout@v4`, duplicated Maestro install/upload steps, and missing timeouts on the label jobs. The
tail covers supply-chain pinning (SHA pins + a missing `dependabot.yml`), brittle inline `node -p`
lockfile parsing, and assorted consistency papercuts.

## Source: Code audit — scrapbook · run-artifact code

### [P2][duplication] Hub `CATEGORIES` registry + per-category page counts duplicate the generator's source of truth with no drift guard

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:182-191`, `:220` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

The hub hardcodes the full category list and page counts:

```js
var CATEGORIES = [
  { id: 'farm', name: 'Farm', pages: 6 },
  { id: 'dinosaur', name: 'Dinosaurs', pages: 6 },
  ...{ id: 'vehicles', name: 'Vehicles', pages: 6 },
];
```

and renders `'Category ' + (i + 1) + ' of ' + CATEGORIES.length + ' · ' + cat.pages + ' pages'`
(line 220). Every value here is a copy of state that actually lives in the proof-sheet generator
(`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs`) and in the sibling `*.html` sheets.
Nothing keeps them in lockstep:

* `npm run scrapbook:check` only verifies each *collection dir* resolves to one entry page
  (`collectionsMissingEntry`) and that the top-level `index.html` is fresh — it never looks inside
  the hub. Adding a new category sheet (e.g. a future `bugs.html`) leaves the hub silently omitting
  it; the sheet is reachable by URL but invisible in the tab strip.
* A page-count change (say `farm` drops from 6 to 5 pages) makes the "· 6 pages" label lie, with no
  test to catch it.

This is the single highest-drift spot in the whole section: it is the only committed page with a
hardcoded mirror of generator data and no automated reconciliation.

#### Proposed solution

Prefer eliminating the copy: have the proof-sheet generator (or a small `scrapbook:index`-adjacent
step) emit the `CATEGORIES` array — or the whole hub — from the same manifest it uses to build the
sheets, so id/name/pages have one source. If the hub must stay hand-authored, add a check (extend
`scrapbook:check`) that (a) every `coloring-book-proof-sheets/*.html` sheet except `index.html`
appears as a `CATEGORIES` entry and vice-versa, and (b) each `pages` value matches the sheet's
actual page count. At minimum, drop the `pages` field if it can't be verified — a wrong count is
worse than no count.

#### Verification

Add a ninth category sheet without editing the hub and confirm today it does not appear in the tabs
and no check fails; after the fix, either the tab appears automatically or `scrapbook:check` fails
with a clear message. For the count: edit a sheet's page count and confirm the guard flags the stale
`pages` value.

---

### [P3][correctness] Deep-linking via `hashchange` (or back/forward) leaves `document.title` stale

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229`, `:240` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

`show(i, skipHash)` updates the tab title only inside the non-skip branch:

```js
if (!skipHash) {
  if (location.hash.replace(/^#/, '') !== cat.id) location.hash = cat.id;
  document.title = 'Splotch proof sheets — ' + cat.name; // only here
}
```

The `hashchange` listener calls `show(indexFromHash(), true)` (line 240) with `skipHash = true`, so
navigating by editing the URL hash, or using browser back/forward between categories, swaps the
iframe but never updates `document.title`. The visible page changes while the tab caption stays on
whatever category was last selected by click. The bug exists because the flag conflates two
unrelated concerns (see next finding).

#### Proposed solution

Move `document.title = …` out of the `if (!skipHash)` block so it runs on every category switch
regardless of how it was triggered. Keep only the `location.hash` write gated by the flag.

#### Verification

Load the hub, click "Farm", then edit the URL to `#space` (or press Back). Observe the tab title
stays "…Farm" before the fix; after moving the assignment out, the title tracks the shown category
on every path.

---

### [P4][readability] `skipHash` boolean is a control-flag that silently gates two behaviours

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The parameter is named for one job (skip writing the hash) but the `if (!skipHash)` block also owns
the `document.title` update. A reader reasonably assumes `skipHash` only suppresses the URL write,
which is exactly how the stale-title bug (previous finding) slipped in. Bundling "should I write the
hash?" and "should I update the title?" under one negated flag is a classic control-coupling smell.

#### Proposed solution

Split the concerns: always update the iframe, tab state, and title; take a separate,
positively-named argument (e.g. `writeHash = true`) that governs only the `location.hash`
assignment. The two callers that pass `true` today (`hashchange`) become `writeHash = false`.

#### Verification

Re-read `show()`: each side effect should be unconditional except the hash write. Confirm both
callers still behave (click writes hash; hashchange does not re-write it and loop).

---

### [P4][correctness] Initial load rewrites the URL to `#farm` and pushes a history entry

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:226`, `:242` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

On first load with no hash, `show(indexFromHash())` runs with `indexFromHash()` returning `0`, and
because `skipHash` is falsy it executes `location.hash = cat.id` (line 226) since `'' !== 'farm'`.
So opening the bare hub URL immediately mutates the address bar to `…/index.html#farm` and, because
assigning `location.hash` creates a new history entry, adds a spurious Back-button stop before the
page the user actually arrived from. The shareable/canonical URL a visitor copies also silently
gains a `#farm` they didn't choose.

#### Proposed solution

For the canonicalisation-on-load case use `history.replaceState(null, '', '#' + cat.id)` instead of
assigning `location.hash`, so the hash is normalised without a new history entry. (User-initiated
tab clicks can keep pushing entries if per-category back/forward is desired — that's a deliberate
choice to make explicitly.)

#### Verification

Open the hub from another page, then press Back: today it returns to `#farm`-less state (an extra
stop) rather than the previous page. After the fix, Back leaves the hub directly.

---

### [P3][maintainability] Hub palette renames the shared chrome tokens, defeating the "keep in sync by eye" note

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:8-43` (hand-authored hub) — pinned at
SHA f934d43

#### Problem

The hub opens with a comment promising the palette is "Kept in sync by eye with the shared scrapbook
chrome (scripts/lib/scrapbook-chrome.mjs)". But it then declares the tokens under *different names*
than the chrome uses — `--fg`/`--bg`/`--bar`/`--line`/`--tab-bg`/`--tab-fg` here vs
`--ink`/`--paper`/`--card-2`/`--hair` in the generated pages (e.g. `scrapbook/index.html:12-13`,
`crayon-brush-samples/index.html:11-13`). A maintainer trying to reconcile the two blocks after a
chrome change can't diff them line-for-line; they must first mentally map `--fg` ↔ `--ink`, `--bar`
↔ `--card-2`, etc. The renamed vocabulary makes the one sync mechanism the file relies on (human
eyeballing) maximally error-prone.

#### Proposed solution

Adopt the chrome's exact token names in the hub so the two `:root` blocks are copy-comparable (or a
future extraction can literally share them). Where the hub genuinely needs extra tokens (`--tab-bg`,
`--tab-fg`), keep those but layer them on top of the shared names rather than substituting the core
ones.

#### Verification

Diff the hub's `:root` light block against the shared chrome's after the rename — the shared subset
should match token-name-for-token-name, so a drift is a visible diff.

---

### [P4][duplication] Hub re-implements the masthead/crayon-strip/breadcrumb chrome by hand

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:150-173` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The `<header>` block hand-copies the crayon-strip brand, the `Splotch / Scrapbook` wordmark, and the
breadcrumb that `scripts/lib/scrapbook-chrome.mjs` generates for every other page. The README even
concedes it "carries the shared crayon masthead + breadcrumb by hand; keep it in sync". This is real
structural duplication (distinct from the token duplication above): a change to the generated chrome
(a new brand element, a different crumb separator) leaves this page visually diverged with no guard.

#### Proposed solution

Since the hub is intentionally hand-authored (an iframe switcher the generator doesn't produce), the
cleanest fix is to have `scrapbook-chrome.mjs` expose its masthead/breadcrumb fragment as a reusable
export and generate the hub's shell (injecting the hand-authored tab strip + iframe + script) rather
than hand-writing the chrome. If full generation is too much, at least factor the chrome HTML into a
shared string both the generator and a tiny hub-build step consume.

#### Verification

Change the generated masthead (e.g. crumb separator) and confirm the hub does not follow today;
after the fix the hub inherits the change (or a check flags the divergence).

---

### [P3][discoverability] README omits the `crayon-brush-samples` collection and how it's regenerated

**File(s):** `scrapbook/README.md` (whole file; cf. the icons paragraph at `:66-71`) — pinned at SHA
f934d43

#### Problem

The README's "Live URLs" section calls out how to regenerate the coloring-book proof sheets, the
icon gallery, and the model-eval report, but never mentions the `crayon-brush-samples/` collection —
even though it is a committed top-level collection with its own generators
(`tools/asset-gen/crayon-brush-samples/build-sheet.mjs` → `index.html`, `build-compare-sheet.mjs` →
`vs-current.html`). A newcomer who opens `scrapbook/crayon-brush-samples/` in the tree has, unlike
every other collection, no in-`scrapbook` pointer to what produced it or how to refresh it.

#### Proposed solution

Add a short paragraph alongside the icons/coloring entries: what `crayon-brush-samples/` is, its
live URL (`…/crayon-brush-samples/`), and that `index.html`/`vs-current.html` are built by the
`tools/asset-gen/crayon-brush-samples/` scripts (link to that dir's README). Keep it symmetric with
the existing collection blurbs.

#### Verification

Grep `scrapbook/README.md` for `crayon-brush-samples` — currently zero hits; after the fix the
collection is documented like the others.

---

### [P3][discoverability] README warns about masthead sync but not the hub's category-registry maintenance step

**File(s):** `scrapbook/README.md:61-65` — pinned at SHA f934d43

#### Problem

The README tells maintainers the coloring hub `index.html` is a keeper that must be kept "in sync"
with the chrome masthead/breadcrumb by hand. It does *not* mention the more consequential manual
step: adding or removing a proof-sheet category requires editing the hub's `CATEGORIES` array (and
its `pages` count) or the new sheet is invisible in the hub (see the P2 finding). The one piece of
the hub most likely to need editing is the one the docs are silent on.

#### Proposed solution

Extend the existing hub note to state that adding/renaming/removing a category means editing the
`CATEGORIES` array in `coloring-book-proof-sheets/index.html` (and its `pages` count), until/unless
that array is generated. Pair this with whatever guard the P2 finding lands on.

#### Verification

The README's coloring-hub paragraph should name `CATEGORIES` as a hand-maintained list; confirm a
reader adding a category is told to edit it.

---

### [P4][accessibility] Tab UI is built from bare `<button>`s with no tab ARIA semantics

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:168-177`, `:199-206` (hand-authored
hub) — pinned at SHA f934d43

#### Problem

The hub implements a genuine tablist — mutually-exclusive `.on` state, ←/→ arrow navigation, a
switched iframe — but with no assistive semantics: `<div class="tabs">` is not `role="tablist"`, the
generated buttons are not `role="tab"` and never set `aria-selected`, and the `<iframe id="sheet">`
is not `role="tabpanel"` associated to the active tab. Screen-reader users get eight unlabelled
toggle buttons and an untied frame instead of a coherent tab widget.

#### Proposed solution

Add `role="tablist"` to the `.tabs` container, `role="tab"` + `aria-selected` (toggled alongside the
`.on` class in `show()`) to each button, and wire the iframe as the panel (`role="tabpanel"` +
`aria-labelledby`). This is a reference/keeper page so the bar is low, but the tab pattern is
already there — the semantics are cheap to finish.

#### Verification

Run an a11y checker (axe) against the hub, or tab through with a screen reader: the tab strip should
announce as a tablist with a selected tab.

---

### [P4][naming] Inconsistent element-variable suffixing (`frame` vs `tabsEl`/`countEl`)

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:193-196` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

```js
var tabsEl = document.getElementById('tabs');
var frame = document.getElementById('sheet');
var countEl = document.getElementById('count');
```

Two of the three cached elements use the `…El` suffix convention; the middle one (`frame`, for the
element with `id="sheet"`) does not, and its variable name (`frame`) doesn't match its id (`sheet`)
either. Small, but it's the kind of inconsistency that makes a reader hunt.

#### Proposed solution

Pick one convention. Either `sheetEl`/`tabsEl`/`countEl` (matching ids + suffix) or drop the suffix
uniformly. Align the variable name with the element id.

#### Verification

Read lines 193-196: the three cached-element names should follow one visible rule.

---

### [P5][readability] Hub script uses ES5 `var` + function expressions despite a modern-only target

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:178-243` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The entire `<script>` is written in ES5 style — `var` bindings, `function () {}` callbacks
throughout. The scrapbook is self-contained modern HTML served to current browsers (the repo's
`docs/COMPATIBILITY.md` floor is well past ES5), and the rest of the codebase is `const`/`let` +
arrow functions. There is no build/transpile step here, so the dated style is a pure readability
drag with no compatibility upside, and it's inconsistent with how a contributor would expect Splotch
JS to read.

#### Proposed solution

Modernise in place: `const`/`let`, arrow callbacks, template literals for the count string.
Behaviour is unchanged; the diff is mechanical. Low priority — it works as-is.

#### Verification

Load the hub after the rewrite and exercise tabs, arrows, and hash deep-links; behaviour identical,
source reads in the house style.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

### [P2][dead-config] dprint loads the TypeScript and JSON plugins but never runs them

**File(s):** `dprint.json:10-13,23-27` (formatting) — pinned at SHA f934d43

#### Problem

`dprint.json` loads three plugins and configures a TypeScript block:

```json
"typescript": { "quoteStyle": "preferSingle" },
"includes": ["**/*.md"],
...
"plugins": [
  "node_modules/@dprint/markdown/plugin.wasm",
  "node_modules/@dprint/typescript/plugin.wasm",
  "node_modules/@dprint/json/plugin.wasm"
],
```

`includes` matches only `**/*.md`. dprint only formats a file when it is in `includes` *and* a
plugin claims its extension — so with markdown the sole included glob, the `@dprint/typescript` and
`@dprint/json` plugins (and the `typescript.quoteStyle` config block) never execute. `format:md`
(`dprint fmt`) and `format:md:check` (`dprint check`) touch only markdown. The two extra WASM
plugins are dead weight: they are downloaded/cached, listed as `devDependencies` (`@dprint/json`,
`@dprint/typescript` at `package.json:252-254`), and mislead a reader into thinking dprint owns
`.ts`/`.json` formatting when Prettier owns `.ts` and *nothing* owns `.json`.

#### Proposed solution

Either (a) delete the `@dprint/typescript` + `@dprint/json` plugin lines, the `typescript` config
block, and their two `devDependencies`, to make dprint honestly markdown-only (matches ADR-0057); or
(b) if JSON formatting is actually wanted, add `**/*.json` to `includes` and wire `format:md` into
`format` accordingly — but that overlaps Prettier/`.prettierignore` and should be an explicit
decision, not latent config. Option (a) is the low-risk default.

#### Verification

`grep -c '\.ts' <(git ls-files '*.md')` — no TS files are markdown, confirming the plugin is
unreachable. After removing, run `npm run format:md:check` and confirm identical output. Confirm no
other tool references `@dprint/json`/`@dprint/typescript`: `git grep dprint/json dprint/typescript`.

---

### [P2][dead-config] No formatter owns JSON/YAML — config files drift unchecked

**File(s):** `.prettierignore:26-29`, `dprint.json:13` (formatting) — pinned at SHA f934d43

#### Problem

`.prettierignore` deliberately excludes the config formats:

```
# Deliberately out of Prettier scope for now — remove these to bring configs into the check
*.json
*.yml
*.yaml
*.webmanifest
```

and dprint's `includes` is `["**/*.md"]` only (see the previous finding), so *no* formatter and *no*
CI check owns `package.json`, `tsconfig`s, `.vscode/*.json`, `netlify.toml`-adjacent YAML, GitHub
workflow YAML, or the webmanifest. These files — including this very `package.json` with its 117
hand-maintained script rows — can drift in indentation/key style with zero enforcement, and the
loaded-but-unused `@dprint/json` plugin makes it look like coverage exists when it doesn't.

#### Proposed solution

Decide and wire one owner for JSON/YAML: simplest is to drop `*.json`/`*.yml`/`*.yaml`/
`*.webmanifest` from `.prettierignore` (Prettier already handles all four) and let `format:check`
cover them; or add `**/*.json` etc. to `dprint.json` `includes` and use the already-loaded JSON
plugin. Whichever is chosen, delete the other's dead config so there is a single, discoverable
owner.

#### Verification

`npx prettier --check '**/*.json'` (or `dprint check` after adding the glob) currently either errors
on the ignore or reports "0 files"; after the fix it should lint the real config tree. Add a
deliberately mis-indented key to a JSON file and confirm the chosen check now fails.

---

### [P2][dead-config] `.markdownlint.json` is orphaned and duplicates dprint's markdown style

**File(s):** `.markdownlint.json:1-11`, `dprint.json:4-9` (formatting) — pinned at SHA f934d43

#### Problem

`.markdownlint.json` configures a markdownlint ruleset (asterisk bullets, asterisk emphasis, fenced
code, `---` HR, etc.). But ADR-0057 made **dprint the sole markdown owner**, and nothing consumes
this file: `markdownlint` is not a dependency, not in any `scripts`/`scripts-info` entry, and not in
`.vscode/extensions.json` recommendations (`dprint.dprint`, `esbenp.prettier-vscode`,
`svelte.svelte-vscode`). The only repo reference to markdownlint is inside ADR-0057 itself. Worse,
its rules **restate** dprint's config with no cross-reference — `MD004 asterisk` ↔
`unorderedListKind: "asterisks"`, `MD049 asterisk` ↔ `emphasisKind: "asterisks"` — a second source
of truth for the same markdown style that a future edit to `dprint.json` will silently desync from.

#### Proposed solution

Delete `.markdownlint.json`. dprint already enforces the identical style via `format:md:check` in
CI. If interactive lint-in-editor is still wanted, add the markdownlint extension to
`.vscode/extensions.json` and keep the file — but then document the dprint/markdownlint style
coupling in one place. Deletion is the ADR-0057-consistent default.

#### Verification

`git grep -l markdownlint -- ':!package-lock.json' ':!.markdownlint.json'` returns only
`docs/adrs/0057-*.md` — proving no tool reads it. After deletion, `npm run format:md:check` still
passes.

---

### [P2][duplication] `--experimental-strip-types --disable-warning=ExperimentalWarning` repeated 10× and likely stale

**File(s):** `package.json:20,25,72,73,76,77,78,85,86,91` (scripts) — pinned at SHA f934d43

#### Problem

Ten scripts invoke Node with the identical verbose flag pair, e.g.:

```json
"build:cap": "CAPACITOR=true node scripts/web.mjs vite build && node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/strip-native-assets.mjs",
"gen:tokens": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/gen-tokens.mjs",
```

Two problems: (1) the 60-character flag string is copy-pasted verbatim ten times — any change (or a
typo in one) must be reconciled by hand; (2) it is likely **stale**. `engines.node` is `">=22.13"`
(`package.json:6`); Node stabilized type-stripping so that `--experimental-strip-types` became the
default (and the flag a deprecated no-op emitting its own warning) from 22.18 / 23.6 onward. On a
modern Node in the supported range the whole pair is redundant, and `--disable-warning` exists only
to silence a warning the flag itself triggers.

#### Proposed solution

Either drop both flags (verify on the project's Node floor that `node scripts/gen-tokens.mjs` strips
types without them), or, if the floor must keep them, factor a single helper — e.g.
`scripts/run-ts.mjs` that re-execs Node with the flags, or a package-level shell alias — so the flag
string lives in exactly one place. Update `engines.node` to the version where the decision holds.

#### Verification

On the CI Node version: `node scripts/gen-tokens.mjs --check` (no flags) — if it runs, the flags are
dead. `grep -c 'experimental-strip-types' package.json` should drop from 10 to 0 (or to 1 in a
shared helper).

---

### [P3][duplication] Browser-support floor is duplicated between `browserslist` and vite `build.target`

**File(s):** `package.json:304-310`, `web/vite.config.ts:77` (build config) — pinned at SHA f934d43

#### Problem

The root `package.json` declares:

```json
"browserslist": [ "chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4" ]
```

and `web/vite.config.ts:77` hard-codes the same floor as
`build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] }`, with a comment
"Keep in sync with `browserslist` in the root package.json". Two hand-synced sources of truth for
the same five-browser floor. It is also unclear what actually *consumes* the `browserslist` field:
vite compiles against `build.target`, not browserslist, so the array may be feeding only
`update:browserslist`/caniuse-lite and otherwise be inert — a reader can't tell whether editing it
changes any output.

#### Proposed solution

Make one the source of truth. Simplest: keep `browserslist` as the single declaration and have
`vite.config.ts` derive `build.target` from it (e.g. via `browserslist-to-esbuild`), or, if vite's
`build.target` is the real control, delete the `browserslist` field and the `update:browserslist`
script and document the floor once in `docs/COMPATIBILITY.md` + `vite.config.ts`. Either way, remove
the "keep in sync by hand" coupling.

#### Verification

Change one browser version in the chosen source and rebuild; confirm the emitted bundle's
syntax-lowering target moved (e.g. inspect for `??`/optional-chaining lowering). Confirm the other
file no longer needs a manual edit.

---

### [P3][duplication] Four ignore lists re-encode the same excluded paths with no shared source

**File(s):** `eslint.config.js:13-23`, `.prettierignore:1-14`, `dprint.json:14-22`, `.gitignore`
(config) — pinned at SHA f934d43

#### Problem

The generated/vendored dirs are enumerated independently in every config:

* `eslint.config.js:13-23`: `.svelte-kit`, `build`, `.netlify`, `node_modules`, `android/`, `ios/`,
  `scrapbook/`, `web/src/lib/components/icon-names.d.ts`, `web/src/lib/releases.json`
* `.prettierignore:1-14`: the same set plus `package-lock.json`, `tokens.css`, `*-snapshots/`, …
* `dprint.json:14-22`: `node_modules`, `.svelte-kit`, `.netlify`, `.gradle`, `web/build`,
  `android/**/build`, `ios/**/build`

Adding a new generated artifact (or renaming `icon-names.d.ts`/`releases.json`) requires editing
three or four files, and they already disagree in ways a newcomer can't distinguish from bugs
(`eslint` ignores all of `android/`, dprint ignores only `android/**/build` because it must still
format generated `android/**/*.md` — but nothing says so).

#### Proposed solution

Can't fully share across tools with different config languages, but reduce the surface: add a short
comment in each list pointing to the others ("generated-path ignores also live in `.prettierignore`
/ `dprint.json`"), and align the glob *style* (see the consistency finding). For the two
project-specific generated files (`icon-names.d.ts`, `releases.json`), consider co-locating them
under a single ignored dir so one glob covers both everywhere.

#### Verification

`git grep -n 'icon-names.d.ts'` shows it hard-coded in both `eslint.config.js` and `.prettierignore`
— renaming it today silently breaks one. After co-location, a single glob per tool should cover it.

---

### [P3][dead-config] `.gitignore` is padded with generic-template entries for tools this repo never uses

**File(s):** `.gitignore:42-137` (config) — pinned at SHA f934d43

#### Problem

Roughly 60 lines are boilerplate from the standard Node `.gitignore` for frameworks/tools absent
from this SvelteKit + Capacitor project: `.grunt` (42), `bower_components` (46), `.lock-wscript`
(49), `jspm_packages/` (56), `web_modules/` (59), `.next`/`out` (92-93), `.nuxt`/`dist` (95-97),
Gatsby `.cache/` (100), `.vuepress/dist` (106), `**/.vitepress/*` (116-119), `.docusaurus` (122),
`.serverless/` (125), `.fusebox/` (128), `.dynamodb/` (131), `.firebase/` (133), `.tern-port` (137),
`.vscode-test` (140), the entire `.yarn/*` block (143-149). None correspond to a tool in
`package.json`. The noise buries the ~30 lines that are actually project-specific and load-bearing
(the Playwright/perf/redteam/coloring-samples/maestro anchored ignores), hurting grepability.

#### Proposed solution

Prune the unused framework blocks, keeping only entries that match tools actually in use (Vite,
SvelteKit, Playwright, Netlify, Capacitor, dprint, the project's own scratch dirs). Keep the
generic-but-cheap safety nets (`*.log`, `.env*`, `.DS_Store`, `node_modules/`, `coverage`).

#### Verification

For each removed entry, `git grep` the tool name in `package.json` returns nothing (e.g. `grunt`,
`bower`, `nuxt`, `docusaurus`, `fusebox`). `git status` is unchanged after pruning (nothing that was
being ignored is now surfaced).

---

### [P3][duplication] `.cache` is ignored three times in `.gitignore`

**File(s):** `.gitignore:88,100,110` (config) — pinned at SHA f934d43

#### Problem

`.cache` / `.cache/` appears three times — line 88 (parcel-bundler block), line 100 (Gatsby block),
line 110 (vuepress-v2 block) — all ignoring the same path with different trailing-slash forms. Pure
redundancy that compounds the template-bloat problem above.

#### Proposed solution

Collapse to a single `.cache/` entry (folded into the prune of the previous finding).

#### Verification

`grep -n '^\.cache' .gitignore` currently prints three lines; after the fix, one.

---

### [P3][maintainability] Personal device identifiers are hard-coded into committed scripts

**File(s):** `package.json:106,113,114` (scripts) — pinned at SHA f934d43

#### Problem

Three scripts embed one developer's specific hardware:

```json
"android:run:device": "... ANDROID_SERIAL=R5CY128YMGF node scripts/gradle.mjs :app:installDebug",
"ios:run:emulator":   "... cap run ios --target C6012C49-AA93-4869-B3A6-E47C9EAAC567",
"ios:run:device":     "... cap run ios --target 00008103-0006202E3CF1001E",
```

and the `scripts-info` describes them as the physical "SM-S938U1" phone and "Kyle's iPad". These
serials/UDIDs are meaningless (and non-functional) for any other contributor or CI, yet they sit in
the shared `package.json`. They are effectively personal config committed to the repo.

#### Proposed solution

Read the target from an env var with the current value as a documented fallback, e.g.
`ANDROID_SERIAL=${ANDROID_SERIAL:-R5CY128YMGF}` is not portable inline — instead have the Node
helper (`scripts/gradle.mjs` / a wrapper) accept `--target`/`ANDROID_SERIAL` from the environment
and drop the literals from `package.json`, or move the device-specific variants into a gitignored
local overrides file. At minimum, document in `scripts-info` that these are placeholders to replace
with `adb:devices` / `xcrun simctl list` output (already partially noted for Android).

#### Verification

On a machine without those devices, `npm run ios:run:device` fails with "device not found" — proving
the literal is dead for everyone but one person. After the fix it should resolve from env or error
with a clear "set TARGET_DEVICE" message.

---

### [P3][duplication] AVD name `Pixel_7_Pro_API_33` is hard-coded across four scripts

**File(s):** `package.json:101,102,103,219` (scripts) — pinned at SHA f934d43

#### Problem

The emulator/AVD name is repeated verbatim in `android:boot` (`emulator -avd Pixel_7_Pro_API_33`),
`android:emulator` (`cap run android --target Pixel_7_Pro_API_33`), `android:live`
(`--target Pixel_7_Pro_API_33`), and described in `android:setup`'s `scripts-info` (line 219). The
matching "API 33" system image lives in `scripts/android-setup.mjs`. Renaming the AVD or bumping the
API level touches four+ places with no single constant.

#### Proposed solution

Define the AVD name once — an env default resolved in a Node helper
(`scripts/android-emulator-*.mjs` already exist) or a single constant those scripts read — and
reference it from the `android:*` scripts. Keep the human-readable form in `scripts-info` only.

#### Verification

`grep -c Pixel_7_Pro_API_33 package.json` returns 3 (plus prose); after centralizing it should be 0
in the executable commands.

---

### [P3][documentation] `overrides.tar` pin has no rationale, unlike every other config in the repo

**File(s):** `package.json:298-303` (dependencies) — pinned at SHA f934d43

#### Problem

```json
"overrides": {
  "@capacitor/assets": { "sharp": "$sharp" },
  "tar": "^7.5.19"
},
```

The `sharp: "$sharp"` override is self-explaining (dedupe @capacitor/assets onto the project's
sharp). The `"tar": "^7.5.19"` override has no comment — a reader can't tell whether it is a
security advisory pin, a compatibility workaround, or stale cruft, nor when it can be removed. This
is conspicuous next to `netlify.toml`, which comments nearly every directive. Un-annotated
transitive pins are exactly the config that rots (the advisory gets fixed upstream, the pin lingers
forever).

#### Proposed solution

Add a one-line comment (JSON5 not available in `package.json`, so use a sibling `overrides` note in
the CONTRIBUTING/ADR or a `// tar:` convention isn't possible in strict JSON — instead record the
reason in a short comment in `docs/` or the commit and reference the advisory ID / issue number in
`scripts-info`-adjacent docs). Practically: document the CVE/reason and a removal condition wherever
dependency decisions are tracked, and periodically re-check whether the transitive floor already
satisfies it so the override can be dropped.

#### Verification

`npm ls tar` shows what depends on it and at what version; if the depended-on range already resolves
to `>=7.5.19` without the override, the pin is removable — prove by deleting it and re-running
`npm ci && npm ls tar`.

---

### [P3][dependency-split] `@capacitor/filesystem` appears unused — no JS import anywhere

**File(s):** `package.json:279` (dependencies) — pinned at SHA f934d43

#### Problem

Every Capacitor plugin in `dependencies` is imported from `web/src` (verified) — except
`@capacitor/filesystem`, which has **zero** JS references. Its only repo mentions are the generated
native registrations (`android/capacitor.settings.gradle`, `ios/App/CapApp-SPM/Package.swift`) and
`package.json` itself. A Capacitor plugin that is installed but never called from JS ships in the
native binaries yet does nothing, and — under the inverted-split rule (ADR-0070: `dependencies` =
what the Netlify web build imports) — it doesn't belong in `dependencies` either, since the web
build never bundles it.

#### Proposed solution

Confirm no dynamic import or peer requirement (e.g. `@capacitor-community/media` needing it) then
remove `@capacitor/filesystem`, `cap sync`, and re-run the native smoke test. If a peer/native need
surfaces, document why it is present-but-unimported.

#### Verification

`git grep "@capacitor/filesystem" -- ':!package-lock.json' ':!*.md'` returns only native config +
`package.json` (confirmed). `npm ls @capacitor/filesystem` shows whether anything depends on it
transitively; if it's a leaf with no JS import, it is dead. Remove it and confirm
`npm run test:android:device` still passes.

---

### [P3][maintainability] Dev/preview port numbers are magic values scattered across scripts and configs

**File(s):** `package.json:16,47,103,115,121` (scripts) — pinned at SHA f934d43

#### Problem

The dev port `5173` is hard-coded in `dev:kill` (`kill-port 5173 8888`), `android:live`
(`--port 5173`), `ios:live` (`--port 5173`), `adb:reverse` (`tcp:5173 tcp:5173`); the netlify-dev
port `8888` in `dev:kill`; and the perf-preview port `4173` in `perf:serve`. There is no single
declaration — a contributor changing the vite dev port (set in `web/vite.config.ts`) must hunt down
and update several unrelated scripts, and `dev:kill` will silently kill the wrong port.

#### Proposed solution

Where the port is a vite concern, it already lives in `web/vite.config.ts`; have the port-dependent
Node helpers (`cloud-tunnel.mjs`, the smoke scripts) read it rather than restating literals in
`package.json`. For `dev:kill`, derive the port list from the same source. At minimum, add a comment
in `scripts-info` noting `5173`/`8888`/`4173` are the vite / netlify-dev / perf-preview ports so the
mapping is discoverable.

#### Verification

Change the vite dev port and run `npm run dev` + `npm run dev:kill`; today the kill misses the new
port. After centralizing, both track the config.

---

### [P4][consistency] No `.editorconfig`; indent width `2` and print width `100` are restated in three files

**File(s):** `.prettierrc.json:3,6`, `dprint.json:1-2`, `.vscode/settings.json:4` (config) — pinned
at SHA f934d43

#### Problem

The same two formatting constants live in three places with three vocabularies: `.prettierrc.json`
(`tabWidth: 2`, `printWidth: 100`), `dprint.json` (`indentWidth: 2`, `lineWidth: 100`),
`.vscode/settings.json` (`editor.tabSize: 2` for markdown). There is no `.editorconfig`, so any
editor without the Prettier/dprint extensions gets no indentation guidance, and the `100`/`2` magic
numbers must be kept in lockstep by hand across formatter configs.

#### Proposed solution

Add a root `.editorconfig` (`indent_size = 2`, `max_line_length = 100`, `charset = utf-8`,
`insert_final_newline = true`) as the editor-agnostic source, and reference it in a comment from the
formatter configs. This doesn't remove the per-tool settings (each formatter needs its own) but
gives one canonical statement and covers editors without extensions.

#### Verification

Open a source file in a bare editor (no plugins) and confirm 2-space indent is applied from
`.editorconfig`. Confirm `100`/`2` still agree across `.prettierrc.json` and `dprint.json`.

---

### [P4][consistency] No `.nvmrc` / `.node-version` despite an `engines.node` floor

**File(s):** `package.json:5-7` (config) — pinned at SHA f934d43

#### Problem

`engines.node` is `">=22.13"`, and several scripts depend on version-specific behavior (the
`--experimental-strip-types` flags). But there is no `.nvmrc` or `.node-version` at the root, so
`nvm use` / `fnm`/`asdf`/Volta pick nothing up and contributors + tooling can silently run a
different major than CI. Given the strip-types staleness risk (separate finding), pinning the Node
version a contributor should use is load-bearing here, not cosmetic.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) pinning the exact supported Node line (e.g. the CI version).
Keep `engines.node` as the enforced floor and the version file as the "use this" hint.

#### Verification

`nvm use` in a fresh clone currently errors ("No .nvmrc file found"); after adding the file it
selects the pinned version. Confirm it matches whatever Node the CI/GitHub-Actions setup uses.

---

### [P4][consistency] `info` uses `npx scripts-info` though `scripts-info` is a declared dependency

**File(s):** `package.json:9,16,122` (scripts) — pinned at SHA f934d43

#### Problem

`"info": "npx scripts-info"` calls the binary through `npx` even though `scripts-info` is a
`devDependency` (`package.json:266`) already installed in `node_modules/.bin`. The bare
`scripts-info` would resolve the local binary directly; the `npx` wrapper adds a lookup/prompt path
for no reason. Meanwhile `dev:kill` (`npx kill-port …`) and `update:browserslist`
(`npx update-browserslist-db@latest`) *correctly* use `npx` for packages that are **not**
dependencies. So the same `npx` prefix means two different things across the script block, and the
one case that doesn't need it is the one that has it.

#### Proposed solution

Change `info` to `"scripts-info"` (local binary). Leave the genuine on-demand `npx` calls
(`kill-port`, `update-browserslist-db@latest`) as-is, and consider a brief note that `npx` in this
file signals "not a declared dependency".

#### Verification

`npm run info` still prints the script table. `ls node_modules/.bin/scripts-info` confirms the local
binary exists, so `npx` is redundant.

---

### [P4][consistency] Ignore-glob style differs across eslint / dprint / prettier for the same paths

**File(s):** `eslint.config.js:14-20`, `dprint.json:18-21`, `.prettierignore:1-9` (config) — pinned
at SHA f934d43

#### Problem

The three tools spell equivalent excludes differently: eslint uses `**/build/` and blanket
`android/` + `ios/`; dprint uses `web/build`, `android/**/build`, `ios/**/build`; `.prettierignore`
uses `**/build/` and blanket `android/` + `ios/`. The dprint narrowing is *intentional* (it must
still format generated `android/**/*.md`), but nothing in the files says so, so the divergence reads
as an accident and invites a "fix" that would either over- or under-format. Style also varies
(`**/build/` vs `web/build`) for what is meant to be the same directory.

#### Proposed solution

Normalize the glob form where the intent is identical, and add a one-line comment in `dprint.json`
explaining why its `android`/`ios` excludes are build-only (to keep formatting generated markdown
under those trees). This turns an apparent inconsistency into documented intent.

#### Verification

`npm run lint`, `npm run format:check`, `npm run format:md:check` all pass unchanged after
normalization — proving the globs were equivalent where merged and deliberately different where
commented.

---

### [P4][consistency] `.vscode/settings.json` wires a formatter only for markdown, not for code

**File(s):** `.vscode/settings.json:1-7`, `.vscode/extensions.json:1-3` (editor config) — pinned at
SHA f934d43

#### Problem

`extensions.json` recommends `dprint.dprint`, `esbenp.prettier-vscode`, and `svelte.svelte-vscode`,
but `settings.json` sets `editor.defaultFormatter` only for `[markdown]` (→ dprint). It never sets
Prettier as the default formatter for `.ts`/`.js`/`.json`/`.svelte`, nor `editor.formatOnSave`. A
contributor who installs the recommended extensions still gets no Prettier-on-save for code and may
default to VS Code's built-in formatter, producing diffs `format:check` then rejects.

#### Proposed solution

Add `editor.defaultFormatter: "esbenp.prettier-vscode"` for `[typescript]`/`[javascript]`/`[json]`
and `svelte.svelte-vscode` for `[svelte]`, plus `editor.formatOnSave: true`, so the committed
workspace settings match the CI formatters end-to-end.

#### Verification

Open a `.ts` file in VS Code with the recommended extensions and save an intentionally mis-formatted
line; today nothing reformats it. After the change, save reformats to match `npm run format:check`.

---
