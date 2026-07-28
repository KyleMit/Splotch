# Audit comments — Consistency

32 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `5b7def5c94b0` — [P1][consistency] Two contradictory store-lifecycle patterns (module-load self-init vs explicit `initX()`)

**Issue**

Listening/side-effecting stores wire themselves up in two mutually exclusive ways with no stated
rule for which to use:

* **Self-initializing at module load:** `layout.svelte.ts`
  (`if (browser) { syncViewport(); addEventListener(…) }`) and `appearance.svelte.ts` (a top-level
  `systemQuery?.addEventListener` plus an `$effect.root`).
* **Deferred behind an exported `initX()` that `+page.svelte` must remember to call:**
  `initNetwork()`, `initFullscreen()`, `initInstallPrompt()` — each guarded by a private
  `let initialized = false`.

`install.svelte.ts` does *both*: its `beforeinstallprompt`/`appinstalled` listeners run at module
load (lines 82-99) while its state seeding waits for `initInstallPrompt()` (line 103). A contributor
…

**Fix**

Converted `network.svelte.ts` and `fullscreen.svelte.ts` to self-initialize their listeners at
module load behind a `browser` guard (matching `layout.svelte.ts`), dropping the `initX()` exports,
their `initialized` flags, and the two hand-wired `+page.svelte` onMount call sites — so the state
is correct before any component mounts and there's no coupling to forget. Documented the "self-init
at module load, install.svelte.ts excepted" rule in `web/src/.ruler/AGENTS.md` and regenerated the
ruler outputs; left `install.svelte.ts` untouched as the documented exception.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/page.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073001773) · 2026-07-24
18:08:47 UTC</sub>

### `db64df85c479` — [P3][consistency] No module uses `$derived`; every reactive-computed value is a getter function

**Issue**

Every derived value in the section is expressed as a plain function that recomputes on each call
rather than a `$derived`. `resolvedTheme()` re-runs
`resolveTheme(settings.theme, appearance.systemDark)` per call; `activeStrokeSize()` re-branches per
call; `visibleActionButtonCount()` re-sums per call. The section literally contains zero `$derived`
(verified: the only "derived" hit in `strokeWidth.svelte.ts:41` is inside a comment). This is a
legitimate convention choice — module-scope `$derived` has its own caveats — but it's undocumented,
so a newcomer can't tell whether reaching for `$derived` is encouraged, discouraged, or forbidden
here, and may inconsistently introduce one.

**Fix**

Extended the `lib/state/` bullet in `web/src/.ruler/AGENTS.md` to codify that shared derived values
are exposed as plain getter functions (citing `resolvedTheme()` and `activeStrokeSize()`), never
module-level `$derived`, and explained why: the getter reads reactive state so callers opt into
reactivity locally by wrapping it in their own `$derived` when a template needs it, while staying
callable as a plain function from a unit test with no reactive context. Regenerated
`web/src/CLAUDE.md`/`web/src/AGENTS.md` via `npm run ruler:apply`.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073002354) · 2026-07-24
18:08:51 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### 3324a164766c — [P3][consistency] State-mutation ownership is inconsistent: some stores are setter-guarded, others are written directly by components

**Issue**

`.claude/rules/svelte.md` says "Components read state and call setters; they never own shared
state." But `canvasState` exposes no setters and `DrawingCanvas.svelte` mutates it directly
(`canvasState.canUndo = …`, `canvasState.strokeCount++`, `canvasState.paperOrientation = …`), while
`settings` forbids direct writes and routes everything through `setX`. `colors` is a hybrid
(exported functions mutate, but the object is also directly writable). The result: to answer "who
can change `strokeCount`?" you must grep the whole `web/src`, whereas for `soundEnabled` the setter
is the single choke point. Grepability — a stated audit goal — is uneven across the section.

**Fix**

Added a header comment to `canvasState` in web/src/lib/state/canvas.svelte.ts documenting it as the
ADR-0004 engine-bridge exception to the setter-only convention, naming DrawingCanvas.svelte's
onMount engine-adoption callbacks as the sole writer and noting that any new writer should route
through that block or the module should grow real setters. Comment-only change; no behavior or API
surface touched.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075037027) · 2026-07-24
22:23:56 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### 6ee1fd4fe180 — [P4][consistency] corner-button consumers use inconsistent sizes (44 vs 48 px)

**Issue**

Both the Fullscreen Toggle and the drawer toggle share `.corner-button` chrome (app.css) and sit in
screen corners, but Fullscreen is `44×44` (30-31) while the drawer toggle is `48×48` (523-524).
Nothing documents why two members of the same visual family differ; it reads as drift. Both also
hardcode `8px` offsets (raw, not `--space-2`).

**Fix**

Moved the shared 48×48 size into `.corner-button` in app.css and dropped the now-redundant
per-component width/height from ActionsPanel's drawer toggle and ParentHelpButton, growing
FullscreenToggle from 44×44 to match; also replaced the three components' raw 8px corner insets with
`var(--space-2)`. All gates (check, unit, asset-gen, scripts, full E2E including flows.spec.ts) pass
green.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079051702) · 2026-07-25
15:26:46 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 2274c33bff01 — [P3][consistency] `Icon` builds its class with string concatenation while `Button` uses the class array API

**Issue**

Icon:

```ts
const colorClass = $derived(COLOR_ICONS.has(name) ? ' icon-color' : '');   // leading-space hack
...
<span class="{className}{colorClass}" ...>
```

Button, the sibling component:

```svelte
<button class={['btn', variant, size, className]} ...>
```

Two components in the same design layer solve identical "compose classes" needs two different ways.
The Icon approach relies on a fragile leading-space literal (`' icon-color'`) and defaults
`className = ''` so the concat doesn't produce `undefinedicon-color`; a missed space silently fuses
class names. Svelte 5's array/object `class` prop (used by Button) is the idiomatic, injury-proof
form.

**Fix**

`Icon.svelte` now composes its class with Svelte 5's array form
(`class={[className, COLOR_ICONS.has(name) && 'icon-color']}`), dropping the `colorClass` derived,
the fragile leading-space literal, the `className = ''` default, and the `class?: string` narrowing
plus its now-stale comment — so `Icon` inherits `ClassValue` from `HTMLAttributes` exactly like
`Button` does. Added three render assertions to `Icon.svelte.test.ts` covering the class token set
for a color icon, a mono icon, and the no-`class` case; enabling them required a one-line
`resolve.conditions: [...defaultClientConditions]` in `web/vitest.config.ts`, because components
compile client-side there while the bare `svelte` import was resolving to `index-server.js` and
`mount()` threw. The `{@html}` eslint suppression became a `disable`/`enable` pair since Prettier
wraps the longer `<span>` and the old `-next-line` no longer pointed at it.

*Revised before approval:* Addressed both review points by taking the second option each offered,
which collapsed to a single action: dropping the mount harness removed the need for the config
change and for the doc updates alike.

Point 1: reverted `web/vitest.config.ts` to its pre-commit state — the
`resolve.conditions: [...defaultClientConditions]` sat at the config root and so flipped `svelte`'s
root export from `index-server.js` to `index-client.js` for all 58 test files, and resolved
`@sveltejs/kit`'s `#app/paths` / `#app/env/public` to client builds even in the 25
`@vitest-environment node` files. Chose reverting over the suggested Vitest-project scoping because
point 2 independently showed a component-mount test is the wrong layer for this repo.

Point 2: removed the `rendered class` describe block and its `mount`/`unmount`/default-`Icon`
imports from `Icon.svelte.test.ts`, which is back to guarding only the `COLOR_ICONS` allowlist (unit
suite 641 → 638 tests). No update to `.claude/rules/testing.md` or the `testing` skill is needed
because the rule as written now holds.

Verification moved to the layer the finding proposed: one `flows.spec.ts` test asserting via
`data-icon` that `#screenshotButton [data-icon="camera"]` carries both `action-icon` and
`icon-color`, and that `.drawer-toggle [data-icon="chevron-right"]` carries both of its two caller
classes and no `icon-color` — the mono case catches a composition that drops or fuses tokens.
Patterns are word-anchored (`/(^|\s)icon-color(\s|$)/`), unlike the bare `/icon-color/` at
flows.spec.ts:823, which would pass an `icon-colour` mutation; mutation-checked that it fails.

Gates: `npm run check` 928 files / 0 errors; `npm run test:unit` 638 passed; eslint + format:check
clean; `flows.spec.ts --project=chromium` 44 passed, and the new test at `--repeat-each=10` 10
passed. Net diff against 959522d is `Icon.svelte` plus the new spec only.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/vitest.config.ts`: adding `resolve.conditions: [...defaultClientConditions]` at the config
  root applies to the whole unit suite, not just the new component test — `svelte`'s root export
  flips from `index-server.js` to `index-client.js` for every test file (so `tick` in
  `src/lib/state/appearance.svelte.test.ts` goes from `async function tick() {}` to the real client
  flush, and the same for the `svelte` imports reached through
  `src/lib/actions/pinchZoom.svelte.ts`), and `@sveltejs/kit`'s `#app/paths` / `#app/env/public` now
  resolve to their client builds even in the 25 `// @vitest-environment node` files, including all
  of `src/lib/server/*.test.ts`. Scope the condition to the component test (a Vitest project entry,
  or a per-file config) rather than flipping module resolution for the entire suite inside a P3
  consistency refactor.
* `.claude/rules/testing.md` is path-scoped to `web/vitest.config.ts` and states that unit tests
  cover pure logic and state modules only, with UI belonging to Playwright; this commit adds the
  repo's first component-mount test (`Icon.svelte.test.ts` is the only test that imports a `.svelte`
  component) plus the config change enabling it, without updating that rule or the `testing` skill.
  Either update those docs in the same change, or verify the class output the way the finding itself
  proposed — via the existing `data-icon` assertions / `/dev/design` — and drop the mount harness.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5079914697) · 2026-07-25
18:29:06 UTC</sub>

## PR [\#546](https://github.com/KyleMit/Splotch/pull/546) — Audit burndown: clear the staged docs/AUDIT.md backlog (2026-07-25)

### a51a1f9a534d — [P1][platform-branching] Web-only PWA code is gated by runtime `isNative()` where a build-time `__IS_CAPACITOR__` branch would tree-shake it out of the native bundle

**Issue**

`web/src/CLAUDE.md` and the root CLAUDE.md both state the convention: prefer the compile-time
`__IS_CAPACITOR__` constant over a runtime `isNative()` for platform branches, because `isNative()`
"alone can't tree-shake." Two web-only paths violate this:

```js
if (canvasState.strokeCount < STROKES_BEFORE_SW_REGISTER) return;
if (!isNative()) registerDeferredServiceWorker();   // line 59
...
if (!isNative()) {
  teardownPWAUpdates = initPWAUpdates();
  initInstallPrompt();                                // lines 164-167
}
```

Because the guard is a runtime call, the native build still bundles `registerDeferredServiceWorker`,
`initPWAUpdates`, and `initInstallPrompt` (and their imports) even though they can never run there —
…

**Fix**

Swapped the two runtime `isNative()` platform guards — the stroke-gated
`registerDeferredServiceWorker()` call in `+page.svelte` and the early return in
`initWebOnlyServices()` — to the Vite-injected `__IS_CAPACITOR__` literal, dropping the now-unused
`isNative` import from both files. This lets Rollup statically drop `registerDeferredServiceWorker`,
`initPWAUpdates`, and `initInstallPrompt` (and their transitive imports) from the native bundle
instead of shipping code that can never run there; runtime behavior on both builds is unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/pwa-registration.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081311039) · 2026-07-26
01:02:30 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### e61decc6c01a — [P4][platform-branching] `app.html` seeds `data-app-surface` with a runtime `location.pathname === '/'` check that duplicates the `/`-page effect and hardcodes the route string

**Issue**

```js
el.toggleAttribute('data-app-surface', location.pathname === '/');
```

The immersive-surface flag is set in three places with the drawing route's path expressed as the
bare literal `'/'`: the boot script (app.html), the `/` page's mount effect (sets it), and its
cleanup (removes it on nav away). The seed logic and the page logic must agree on which path is the
app surface, but the coupling is only the shared `'/'` literal and prose comments. A future change
to the drawing route's path would need edits in both files with no compile-time link.

**Fix**

Added `web/src/lib/boot/appSurfaceRoute.ts` exporting `DRAWING_ROUTE`, pointed `+page.svelte`'s
comment at it, and extended `app.html.test.ts` to fail-closed assert the boot script's
`location.pathname === '/'` literal matches the constant — closing the gap where a route divergence
would go uncaught (the E2E spec only checks post-hydration state, which the page's own mount effect
always overwrites regardless of app.html's literal). No runtime behavior changed.
check/test:unit/eslint all green.

*Revised before approval:* Addressed both review points on a187da0695c9778212cf900bd44274d55b45fa3a
in commit bdc13d5064554226d9bb365f64a7b6ea34099258: added an `existsSync` assertion in
`app.html.test.ts` that `DRAWING_ROUTE` resolves to an actual `+page.svelte` under `routes/`
(catches the drawing route moving, not just the literal drifting), and reworded the `+page.svelte`
comment to accurately say the boot script hardcodes `'/'` and `app.html.test.ts` asserts it matches
`DRAWING_ROUTE`, rather than claiming the boot script is "keyed off" the constant. check/test:unit
(682 tests, up from 681)/eslint all green.

*Revised before approval:* Addressed the review point on bdc13d5064554226d9bb365f64a7b6ea34099258 in
commit a1a0e501e6e8eb0b8c94578747f7c60e6dc41329: the `DRAWING_ROUTE` test now reads the resolved
`+page.svelte` and asserts it contains the `data-app-surface` setAttribute/removeAttribute calls,
instead of only checking the file exists — closing the vacuous-pass case where the drawing page
moves and a different page takes over `'/'`. check/test:unit (682 tests)/eslint all green.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/boot/appSurfaceRoute.ts`'s `DRAWING_ROUTE` is not anchored to the real route — it is
  imported only by `app.html.test.ts`, so the new test detects an edit to app.html's literal but not
  a move of the drawing page, which is the divergence the finding is about. Add an assertion in
  `app.html.test.ts` that `+page.svelte` actually exists at `DRAWING_ROUTE` under `web/src/routes/`
  (e.g. `existsSync` on the resolved route directory), so relocating the drawing route fails the
  test instead of silently leaving both copies stale.
* `web/src/routes/+page.svelte:37-39` states the boot script is "keyed off `DRAWING_ROUTE`", which
  is not true — the boot script hardcodes `'/'` and the constant is only compared against it by a
  test. Reword to say app.html re-types the literal and `app.html.test.ts` asserts it matches
  `DRAWING_ROUTE`.
* `web/src/app.html.test.ts:130` only asserts that *some* `+page.svelte` exists at `DRAWING_ROUTE`,
  which is vacuous for `'/'` — under the exact scenario its comment names (the drawing page moves to
  `/draw` and a landing page takes `/`), the file still exists and the test still passes while both
  `DRAWING_ROUTE` and app.html's literal are stale. Read the file at that path and assert it is the
  drawing page — e.g. that its source contains the `data-app-surface` set/clear effect — so the
  constant is pinned to the page that actually owns the flag; the current comment and the commit
  message claim coverage the assertion does not provide.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081894797) · 2026-07-26
03:57:19 UTC</sub>

### e6405009a97b — [P4][consistency] The engine harness uses `onDestroy` + a top-level `window` read, against the repo's `$effect`-cleanup convention for teardown

**Issue**

`.claude/rules/svelte.md` explicitly warns that `onDestroy` (and top-level component init) also run
during SSR and can throw `ReferenceError: window is not defined`, and directs teardown into an
`$effect` cleanup. This page reads `const win = window as …` at top-level script (line 33) and tears
down via `onDestroy` (237-239). It's safe *today* only because `+page.ts` sets `ssr = false` — a
non-local invariant. If someone re-enables SSR for the harness (or another page imports this
component), it breaks in exactly the way the rule describes.

**Fix**

Replaced the `onDestroy` teardown in the engine dev-harness with an `$effect` cleanup (SSR-safe),
dropped the now-unused `onDestroy` import, and added an inline comment at the top-level `window`
read pinning its safety to `+page.ts`'s `ssr = false`. All acceptance gates (check, unit tests,
eslint, tests/engine.spec.ts) pass green.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/engine.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081896226) · 2026-07-26
03:57:41 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### db5194355917 — [P3][consistency] Two divergent `[ai-usage]` log formats for the same concept

**Issue**

The managed path logs via `recordTokenUsage` with a structured line
(`token=… style=… prompt=… at=…`, masked token), but the BYOK path hand-writes a *different*
`[ai-usage]` line inline in the route:

```ts
console.log(`[ai-usage] byok style=${style || 'none'} at=${new Date().toISOString()}`);
```

Same log namespace, two formats, one of them living in route code instead of the usage module that
owns `[ai-usage]` logging. A log consumer parsing `[ai-usage]` lines must handle two schemas, and
the route now knows the audit-log format.

**Fix**

Added a synchronous `recordByokUsage` helper and routed BYOK generation logging through it so
managed and BYOK audit lines share the same structured field order. Added focused coverage for
prompt escaping, ISO timestamps, and the absence of Netlify Blobs access.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084870204) · 2026-07-26
18:43:17 UTC</sub>

### 55e95b53bd8f — [P3][consistency] Logical-failure status convention differs (200+{ok:false} vs 4xx) between verify-* and report

**Issue**

verify-access-code and verify-key return **HTTP 200** with `{ ok: false, error }` for logical
failures (no code, unrecognized code, no key, bad key), while `report` returns proper **4xx** with
`{ ok: false, error }` for its logical failures (missing kind → 400, empty message → 400). Both are
"the request was well-formed but the operation didn't succeed," handled with opposite status
conventions. A caller (or a smoke test) can't rely on status alone; `aiCredential.ts:41` has to
check `res.ok && data.ok === true` precisely because of the 200-on-failure choice.

**Fix**

Documented that ordinary credential-oracle failures intentionally return HTTP 200 with
`{ ok: false, error }` to avoid leaking validity through status, while non-oracle validation remains
4xx and throttling remains 429.

*Revised before approval:* Scoped the HTTP 200 convention specifically to the dedicated
`verify-access-code` and `verify-key` oracle endpoints, avoiding conflict with authorization
endpoints that correctly reject invalid credentials with 403.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `.claude/rules/server-api.md:21` overgeneralizes the 200 convention to “comparable negative
  credential checks,” but `/api/generate-image` rejects an invalid managed token with 403 and
  `/api/admin/login` rejects a bad credential with 403. Scope the rule to the dedicated `verify-*`
  endpoints or explicitly document these exceptions so the new convention matches actual behavior.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084891340) · 2026-07-26
18:48:54 UTC</sub>

### 0a0fddd81395 — [P3][consistency] Duplicated, divergent numeric-flag validators

**Issue**

The same validations are re-written with inconsistent wording:
`--temperature must be between 0 and 2` (chalk, fresh, normalize) vs
`--temperature must be a number between 0 and 2, got "…"` (fills, covers);
`--samples must be a positive integer` with vs without the offending value. dark alone repeats four
`>= 0` guards inline. Each is a hand-rolled `if (!(Number.isInteger(x) && x >= 1)) fail(...)`.

**Fix**

Added shared numeric CLI parsers and applied them across all six generators, preserving defaults and
registry context while adding the missing dark-fill temperature validation. Focused tests cover
canonical diagnostics, bounds, coercion, defaults, and integer rejection.

*Revised before approval:* Separated canonical flag names from optional registry-source context, so
direct CLI failures now match across every affected generator while registry failures still identify
their page source. Added command-level coverage for the exact shared temperature, positive-integer,
and non-negative diagnostics.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The builder-based call sites pass names such as `--temperature (cli)` into the shared validators
  (for example `gen-coloring-chalk.mjs:232`, `gen-coloring-fills-dark.mjs:225`, and
  `normalize-outline-strokes.mjs:95`), so their CLI diagnostics still differ from fills, fresh
  outlines, and style covers; pass the canonical flag name separately from any registry-source
  context and test the actual command-facing messages.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086082772) · 2026-07-27
00:13:44 UTC</sub>

### f7d3101998ac — [P3][consistency] `png-to-webp` configured by env vars instead of flags

**Issue**

`const quality = Number(process.env.QUALITY ?? 80); const lossless = process.env.LOSSLESS === '1';`
is the only script in the directory that takes its options through environment variables. It's
undiscoverable (no `parseArgs`, no validation — `QUALITY=abc` silently yields `NaN`), and
inconsistent with the `namespace:variant` + flag conventions everywhere else.

**Fix**

Added `--quality` and `--lossless` parsing while preserving the documented environment fallbacks
only when their corresponding flags are absent. Quality values now pass through the shared
non-negative validator before Sharp runs.

*Revised before approval:* Extracted the converter’s argument resolution into the existing CLI
utility so it can be tested without rewriting assets. Added regression coverage for defaults,
environment fallbacks, both flags, flag-over-environment precedence, and invalid `QUALITY`
rejection.

*Revised before approval:* Applied Prettier’s required formatting to the invalid-`QUALITY`
regression assertion so the driver’s formatting gate accepts the test.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Add regression coverage in `tools/asset-gen/tests/cli.test.mjs` for `png-to-webp.mjs`; the new
  flags, flag-over-environment precedence, and invalid `QUALITY` fallback are currently untested and
  can regress while the unit suite remains green.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086085130) · 2026-07-27
00:14:13 UTC</sub>

### eb381cabd7bf — [P4][consistency] Progress written to `stderr` in one audit, `stdout` in the rest

**Issue**

`audit-night-halo` prints its per-page progress counter and final timing via `console.error`, while
its ranked table goes to `console.log`. The intent (keep the pipeable table on stdout, chatter on
stderr) is defensible but undocumented and unique — no other tool in the directory splits streams,
so it reads as an inconsistency rather than a deliberate choice, and `--out` already exists for
machine consumption.

**Fix**

Documented the intentional stderr progress/timing stream, keeping stdout pipeable for the ranked
table and `--out` as full JSON output.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086086836) · 2026-07-27
00:14:34 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### bc3a7e0bc115 — [P2][consistency] Playwright imported from two different packages

**Issue**

Half the browser-driving scripts import `chromium` from `playwright`, the other half from
`@playwright/test`. They resolve to the same runtime, but the split is arbitrary, invites confusion
about which package is the dependency, and pairs with the CHROMIUM_PATH inconsistency above (the
`playwright` importers are exactly the ones using the brittle path). It also matters for the
inverted deps rule (ADR-0070): whichever package the web build doesn't need should be consistent.

**Fix**

Switched the three model-eval scripts to import `chromium` from `@playwright/test` instead of the
bare `playwright` package, so every Chromium launcher under `scripts/` resolves through the one
declared devDependency rather than a transitive one. Both packages share the same installed
`playwright-core`, so this is a same-runtime swap with no behavioral change — confirmed by
re-running the driver smoke test and regenerating the 45-fixture eval corpus byte-identically.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — checked the claim this rests on, because it is what turns the finding
from cosmetic into substantive. `package.json` declares **neither** `playwright` in `dependencies`
nor in `devDependencies`; only `@playwright/test` is declared (devDependency). So the scripts
importing from bare `playwright` were resolving through a **transitive** dependency they never asked
for — working only as long as `@playwright/test` keeps hoisting it, and liable to break on an npm
hoisting change or a dependency bump with nothing in `package.json` explaining why.

The verification is also the right one for a "same runtime, no behavior change" claim: regenerating
the full 45-fixture corpus byte-identically, rather than asserting that both specifiers reach the
same `playwright-core`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088191506) · 2026-07-27
06:52:28 UTC</sub>

### 4417d82bd21f — [P2][consistency] Missing-API-key guard written three different ways

**Issue**

Three scripts guard `GEMINI_API_KEY`, each with a different idiom and message shape — one uses the
shared `fail()` helper, two hand-roll `console.error` + `process.exit(1)`. The same inconsistency
appears for other required env (`REDTEAM_FIXTURE_KEY`, `ADMIN_ACCESS_TOKEN`, `TUNNEL_AUTH` in
`cloud-tunnel.mjs:22-32` with its own `die()`). Readers get inconsistent exit codes and message
formats for the identical "required env missing" case.

**Fix**

Added a `requireEnv(name, hint)` helper to `scripts/lib/utils.mjs` that returns the value and fails
via the existing `fail()` when unset, then routed the four ad-hoc missing-env guards
(`redteam-run.mjs`, `model-eval-run.mjs`, `model-eval-gen-inputs.mjs`, and `cloud-tunnel.mjs`'s
`TUNNEL_AUTH`) through it, so all three GEMINI_API_KEY call sites now print identical wording and
`cloud-tunnel.mjs`'s single-use local `die()` is gone. One wording nit worth flagging: the
`TUNNEL_AUTH` hint the brief specifies itself contains an em dash, so the rendered message reads
"Missing TUNNEL_AUTH — must match … secret — set it in …" with two of them; I implemented it as
written.

*Revised before approval:* Addressed both review points in a follow-up commit on top of 93e8955. (1)
`.ruler/skills/cloud-preview/SKILL.md` no longer describes the deleted `✗ TUNNEL_AUTH is not set`
line — it now names the `Missing TUNNEL_AUTH — …` shape with no `✗` prefix — and
`npm run ruler:apply` regenerated the `.claude/` and `.agents/` copies (no other generated file
changed). (2) `getKey()` in `scripts/lib/fixtureCrypto.mjs` now calls
`requireEnv('REDTEAM_FIXTURE_KEY', 'set it in .env (see .env.example) or export it')`; `fail`
remains imported for the decrypt-failure path at line 97. Gates: eslint, `npm run test:scripts` (100
tests), `npm run ruler:check`, and `npm run format:check` (prettier + dprint) all pass; the guard
was exercised in a child process with the var removed and exits 1 with the new message.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `.ruler/skills/cloud-preview/SKILL.md:18-19` still tells the agent to watch for a `✗ …` failure
  line "e.g. `TUNNEL_AUTH is not set`" — that message and its `✗` prefix were deleted with
  `cloud-tunnel.mjs`'s `die()`; update the wording to the new `Missing TUNNEL_AUTH — …` shape (no
  `✗`) in the `.ruler/` source and run `npm run ruler:apply` so the `.claude/` and `.agents/` copies
  follow.
* `scripts/lib/fixtureCrypto.mjs:27-33` still hand-shapes its own
  `Missing REDTEAM_FIXTURE_KEY. Set it in .env (see .env.example) or export it` message, though the
  finding names `REDTEAM_FIXTURE_KEY` as one of the guards to unify; route it through
  `requireEnv(…)` in `getKey()`.

**Supervisor verification** — the first review catch is the most interesting straggler of the run so
far, because the thing left stale was **agent instructions, not code**. Changing an error message
silently invalidated `cloud-preview`'s skill doc, which told an agent to watch for a specific
`✗
TUNNEL_AUTH is not set` line that no longer exists — a future session would have waited for a
string the tool stopped emitting. Nothing type-checks that relationship.

The reviewer also got the *mechanism* right, not just the fact: it required the edit in the
`.ruler/` source followed by `npm run ruler:apply`, rather than patching the generated `.claude/`
copy. This repo's `ruler:check` CI gate cannot be one of the driver's per-finding gates (it
re-applies ruler, so it writes files, and a mutating gate would land its output in the fix commit) —
so a finding editing `.ruler/**` has to do this itself, with nothing enforcing it.

Confirmed at HEAD: `.ruler/skills/cloud-preview/SKILL.md` and the generated
`.claude/skills/cloud-preview/SKILL.md` both carry the new `Missing TUNNEL_AUTH — …` wording and are
in sync, so no drift is waiting to redden CI.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088445803) · 2026-07-27
07:21:25 UTC</sub>

### 14621b688e31 — [P3][consistency] Two different "am I the main module?" idioms

**Issue**

Both scripts export helpers for unit tests and guard their CLI entry, but each converts URL↔path in
the opposite direction to compare. Two idioms for one check makes the pattern harder to copy
correctly into the next testable script (and the guards are subtly different if `process.argv[1]` is
undefined).

**Fix**

Added an `isMain(import.meta.url)` helper to `scripts/lib/utils.mjs` and routed the direct-execution
guards in `gha-versions.mjs` and `lint-token-styles.mjs` through it, dropping each file's now-unused
`node:url` import. The helper keeps the `process.argv[1]` guard, so `lint-token-styles.mjs` no
longer risks throwing on `pathToFileURL(undefined)`. I skipped the optional
`scripts/perf/analyze.mjs` conversion the brief flagged as outside acceptance.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — this interacts with 96ae65091117 earlier in the run, where the
reviewer caught a broken main-module guard in `tools/asset-gen/bin/gen-coloring-fills.mjs` and had
it rewritten to `pathToFileURL(process.argv[1]).href`. So it was worth checking whether unifying two
idioms here left a **third** one stranded.

Surveyed all three guards at HEAD:

```
scripts/gha-versions.mjs:191                    if (isMain(import.meta.url)) {
scripts/lint-token-styles.mjs:131               if (isMain(import.meta.url)) {
tools/asset-gen/bin/gen-coloring-fills.mjs:284  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
```

The third one staying inline is **correct, not an oversight**: `tools/asset-gen/CLAUDE.md:50` bars
that tree from importing the repo-root `scripts/lib/`, and unlike `crayon-brush-samples/` (which has
a documented exemption for the shared scrapbook chrome) `bin/` has none. It cannot reach `isMain()`.

One residual worth knowing rather than acting on: the shared helper guards against `process.argv[1]`
being undefined, and the inline copy does not — so `pathToFileURL(undefined)` would throw there. For
a `bin/` entry point invoked as a CLI, `argv[1]` is always defined, so this is theoretical.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088540873) · 2026-07-27
07:32:08 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### bd42f95e387f — [P2][cross-platform] `quoteArg` wraps args in double quotes without escaping `$`, backtick, `\`, or embedded `"`

**Issue**

Every `run()`/`capture()` command is joined into a shell string and executed with `shell: true`.
Non-word args are "quoted" by wrapping in double quotes only:

```js
const quoteArg = (arg) => (/^[\w./:=-]+$/.test(arg) ? arg : `"${arg}"`);
```

Inside double quotes the shell still expands `$VAR`, `$(...)`, backticks, and processes `\`; an arg
containing any of those is mis-executed, and an arg containing a literal `"` breaks the quoting
entirely (splitting the command). Args flowing in from filenames, AVD names, or `input` prompts can
carry these. It is both a correctness bug and a shell-injection surface.

**Fix**

Changed `run()` and `capture()` to pass executable and argument arrays directly to `spawnSync`,
preventing shell expansion while preserving `sh()` as the explicit shell API. Added focused tests
verifying metacharacters and quoted or spaced arguments remain literal through both helpers.

*Revised before approval:* Amended ADR-0017 to document direct executable/argv spawning for `run()`
and `capture()`, including shell-free `PATH` resolution, while reserving deliberate shell command
lines for `sh()`. Updated the cleanup-sensitive guidance to reference the shared rejecting `sh()`
helper.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `docs/adrs/0017-cross-platform-node-scripts.md` still defines `run()`/`capture()` as
  shell-mediated and lists shell-sensitive argument quoting as an active consequence; amend the ADR
  to document direct argv spawning and reserve shell command lines for `sh()`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091624350) · 2026-07-27
13:02:08 UTC</sub>

### 15752eed962e — [P3][cross-platform] `freePort` depends on `lsof`, which is not present on many Linux/CI hosts

**Issue**

```js
const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
```

`lsof` ships by default on macOS but is frequently absent on minimal Linux containers (Debian/Alpine
CI images). When missing, `spawnSync` returns an error result, `out.stdout` is undefined → the
function silently no-ops, and any stale server then trips vite's `--strictPort`. The "best-effort"
comment hides a platform gap the repo's macOS+Linux contract cares about.

**Fix**

Added an explicit `spawnSync()` failure path that warns when `lsof` cannot be launched and tells the
user to stop the stale listener before retrying. Successful PID discovery and cleanup behavior
remain unchanged.

*Revised before approval:* Applied the repository’s Prettier formatting to the new warning call,
removing the trailing argument comma that caused the driver gate to reject the implementation.
Runtime behavior is unchanged.

*Revised before approval:* Reworded the missing-`lsof` warning to say cleanup could not be checked
and to conditionally stop a listener only if the port is in use. Added focused script tests for
unavailable `lsof` and successful discovery with no listener.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `freePort()` warns that a stale listener must be stopped whenever `lsof` is unavailable, even when
  the port is free; probe the port first or make the warning accurately state only that automatic
  cleanup could not be checked.
* The new missing-`lsof` behavior in `scripts/lib/vite-server.mjs` has no regression coverage,
  leaving both the occupied-port warning and the no-listener case untested.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092223268) · 2026-07-27
13:53:55 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### cac5b6496c2b — [P3][consistency] `vite.config.ts` exports an untyped plain object instead of using `defineConfig`

**Issue**

`vitest.config.ts:9` and both Playwright configs use `defineConfig(...)`, but `vite.config.ts`
exports a bare object literal:

```ts
export default {
  server: { ... },
  build: { ... },
  ...
};
```

Only one nested plugin is typed (`satisfies import('vite').Plugin`, line 96); the top-level object
has no `UserConfig` type, so typos in keys (`buld`, `plugin`), invalid option values, or a mistyped
`build.target` entry are not caught by `svelte-check`. This is an inconsistency across sibling
configs and loses the editor autocomplete every other config file here enjoys.

**Fix**

Wrapped the existing Vite config in `defineConfig` and removed the redundant plugin assertion while
preserving all web/native behavior. The brief’s verification note is mistaken—`npm run check` now
reaches this config, so a narrow type intersection preserves the existing `keepNames` profiling
option despite Vite’s absent optional `esbuild` peer types.

*Revised before approval:* Replaced the unchecked assertion with an explicitly typed compatibility
value, so `keepNames` and future profiling options receive excess-property validation while
remaining assignable to `defineConfig`. Runtime profiling behavior is unchanged.

**Adversarial review** — reviewer caught the following; addressed before approval:

* web/vite.config.ts:86: The `as ESBuildOptions & { keepNames: boolean }` assertion bypasses
  excess-property validation for the profiling configuration, leaving nested typos or invalid
  esbuild options unchecked despite the original finding requiring whole-config type safety. Use a
  checked form such as `satisfies` while retaining the `keepNames` compatibility extension.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095184391) · 2026-07-27
18:26:16 UTC</sub>

### cdee1d3df24f — [P4][consistency] `.env.example` mixes placeholder conventions and has a redundant/misleading entry

**Issue**

The file uses three different conventions for "fill this in":

```
# GEMINI_API_KEY=        (commented, empty)
GEMINI_API_KEY=replace   (uncommented, "replace")
ADMIN_ACCESS_TOKEN=replace
...
REDTEAM_FIXTURE_KEY=replace
```

`ALLOWED_TOKENS_LIST` gets a real working value (`"abc,daycare-club"`), others get `replace`, and
`GEMINI_API_KEY` is both commented-out (line 12 as documented-optional) *and* set to `replace` on
the next line — contradictory. Worse, `ADMIN_ACCESS_TOKEN=replace` implies it's consumed, but the
E2E web server hardcodes `ADMIN_ACCESS_TOKEN: 'test-admin-secret'` (`playwright.config.ts:108`),
overriding anything in `.env` — so copying this file with `replace` is silently ineffective for the
admin specs, which is confusing.

**Fix**

Standardized local secret placeholders to empty values and clarified that Playwright injects its
fixed admin credential while real local Netlify servers and deployments use the configured token.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095464512) · 2026-07-27
18:52:02 UTC</sub>

### a09a519c9600 — [P3][consistency] PencilEraserPlugin comment claims iOS 15 deployment target; it is actually 16.4

**Issue**

```swift
// The classic delegate callback is the only one available down to iOS 15 (the project's
// deployment target); it still fires on newer iPadOS, so we always interpret a tap as
```

The project's deployment target is **16.4** (`IPHONEOS_DEPLOYMENT_TARGET = 16.4` in all four pbxproj
configs; `Package.swift` pins `.iOS(.v16)`). The comment's "(the project's deployment target)" is
factually wrong and, since the newer `preferredTapAction` API is available from iOS 16, the stated
rationale for using only the classic callback no longer holds as written. A future contributor
trusting this comment could make the wrong availability decision.

**Fix**

Reworded the delegate comment to explain that the plugin deliberately emits `doubleTap` for every
tap so the web layer toggles the eraser instead of honoring `preferredTapAction`. Removed the
incorrect deployment-target and availability claims without changing behavior.

*Revised before approval:* Updated ADR-0028 to reflect the iOS 16.4 deployment target and document
that the delegate intentionally emits `doubleTap` for every tap instead of honoring
`preferredTapAction`.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `docs/adrs/0028-apple-pencil-eraser-plugin.md:49-51` still claims the classic callback is required
  for the project's “iOS 15 deployment target”; correct this stale rationale to reflect the 16.4
  target and the deliberate choice to ignore `preferredTapAction`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096232276) · 2026-07-27
20:05:44 UTC</sub>

### 067ce3180bb1 — [P4][consistency] `Info.plist` `CAPACITOR_DEBUG` resolves to empty in Release with no explanation

**Issue**

`Info.plist` embeds `<key>CAPACITOR_DEBUG</key><string>$(CAPACITOR_DEBUG)</string>`. The
`CAPACITOR_DEBUG = true` value comes from `debug.xcconfig`, which is set as the
`baseConfigurationReference` **only** on the two Debug configs (pbxproj lines 199 and 307). The
Release configs have no base xcconfig, so `$(CAPACITOR_DEBUG)` expands to an empty string in shipped
builds. That is almost certainly intended (debug flag off in Release), but nothing states it, and
the asymmetry (xcconfig wired to Debug only) is easy to misread as a mistake or to break by
"helpfully" adding the base config to Release.

**Fix**

Documented that CAPACITOR_DEBUG is intentionally Debug-only, with Release leaving its Info.plist
substitution empty.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096618845) · 2026-07-27
20:44:26 UTC</sub>

### e352e074d1bb — [P3][consistency] Claude cloud `setup.sh` uses `#!/bin/bash` while the Codex scripts use `#!/usr/bin/env bash`

**Issue**

The `.claude` shell files use `#!/bin/bash`; the `.codex` files use `#!/usr/bin/env bash`. Both are
reasonable, but the split is arbitrary and undocumented. `#!/usr/bin/env bash` is the more portable
choice (macOS ships an ancient `/bin/bash` 3.2; a Homebrew bash lands on PATH), and ADR-0017
requires scripts to run on both macOS and Linux, so the env form is the better house style to
standardize on.

**Fix**

Updated the six Claude cloud and hook shebangs to resolve Bash through `env`, aligning them with the
Codex cloud scripts while preserving script bodies and executable modes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097058522) · 2026-07-27
21:33:17 UTC</sub>

### fc8cf7cfbf7c — [P3][consistency] Claude `setup.sh` swallows every step with `|| echo` but, unlike the Codex scripts, never summarizes what was skipped

**Issue**

Both cloud setups are best-effort (`set -uo pipefail`, no `-e`). The Codex scripts accumulate a
`warnings=()` array and print a "finished with N warning(s)" summary at the end (`setup.sh:53-60`),
so a partially-provisioned environment is obvious in the log. The Claude `setup.sh` instead prints a
one-off `echo` at each failing step (lines 23, 35, 44) with no roll-up, so a session that had npm,
Playwright, and chisel all fail scatters three lines through a long log with nothing tying them
together. Two setup scripts solving the same "best-effort with visible failures" problem in two
different shapes is avoidable inconsistency.

**Fix**

Added warning collection to the Claude cloud setup so optional npm, Playwright, and chisel failures
remain non-fatal while producing both immediate warnings and a consolidated final summary.

*Revised before approval:* Added script-level Vitest coverage with stubbed provisioning commands,
verifying that a single npm failure and combined Playwright/chisel failures remain non-fatal and
appear in the exact consolidated warning summary.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The new failure aggregation in `.claude/cloud/setup.sh` has no regression coverage; add a
  script-level test with stubbed provisioning commands that verifies single and multiple failures
  remain non-fatal and appear in the final consolidated summary.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097059645) · 2026-07-27
21:33:24 UTC</sub>

### bfd8289ed2ba — [P1][consistency] Issue templates apply labels (`bug`, `enhancement`) that don't exist in the declarative taxonomy

**Issue**

`bug_report.md` sets `labels: bug` and `feature_request.md` sets `labels: enhancement`:

```yaml
# bug_report.md
labels: bug
# feature_request.md
labels: enhancement
```

But the single source of truth for labels, `.github/labels.yml`, defines **`type:bug`** and
**`type:feature`** — there is no `bug` or `enhancement` label in the taxonomy (lines 7-30). Since
`label-sync.yml` runs with `skip-delete: true`, GitHub's default `bug`/`enhancement` labels are
never pruned, so every issue opened through these templates lands with an off-taxonomy label. This
directly undermines the automation and skills keyed on `type:*` (`docs/ISSUE-WORKFLOW.md`,
`burn-down-backlog`, `vet-audits`, the `reviewed`→ToDo move) — a bug filed via the template is not …

**Fix**

Updated the bug and feature issue templates to apply the repository’s canonical `type:bug` and
`type:feature` labels. The generic task template remains intentionally unlabeled.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097382444) · 2026-07-27
22:13:44 UTC</sub>

### 8b2101d9ab7e — [P2][consistency] `actions/checkout` pinned to `@v4` in one workflow and `@v7` in every other

**Issue**

Six workflows are on `actions/checkout@v7`; `label-sync.yml` alone is stuck on `@v4`. This is stale
drift — nothing about label sync needs the older major. Inconsistent pins make "what version do we
run" un-grepable and mean a security advisory or Node-runtime bump has to be tracked per-file.

**Fix**

Updated Label Sync to use `actions/checkout@v7`, aligning its checkout dependency with every other
workflow while leaving label reconciliation behavior unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097554896) · 2026-07-27
22:36:52 UTC</sub>

### 94121bebdd7c — [P3][consistency] Concurrency control is applied unevenly — only two of seven workflows declare a group

**Issue**

`test`, `pages`, and `label-to-todo` set `concurrency`; the other four don't. `label-sync.yml` can
double-run if two `labels.yml` pushes land close together (two labelers racing the same label set),
and `blobs-smoke` can run overlapping instances across rapid `deployment_status` events. There's no
documented rationale for which workflows opt in.

**Fix**

Added non-cancelling concurrency to serialize label reconciliation globally and Blobs smoke runs per
effective deploy URL, preventing overlapping mutations while allowing in-flight cleanup to finish.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097955751) · 2026-07-27
23:23:00 UTC</sub>

### 365b87a72d29 — [P5][consistency] Repo owner casing is inconsistent across `.github` URLs (`kylemit` vs `KyleMit`)

**Issue**

The owner is written `kylemit` in the issue-template contact link and the Pages comment, but
`KyleMit` in `label-to-todo.yml` (both the comment URL and `PROJECT_OWNER: KyleMit`). GitHub
redirects are case-insensitive so nothing breaks, but the inconsistency is a papercut and, for
`PROJECT_OWNER`, the GraphQL `repositoryOwner(login:)` lookup is a value that should match the
canonical casing exactly to avoid a surprise if lookups ever tighten.

**Fix**

Normalized the GitHub owner casing in the issue-template contact link and Pages workflow header URL.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098140387) · 2026-07-27
23:49:40 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### 6da5f53ba629 — [P4][consistency] `info` uses `npx scripts-info` though `scripts-info` is a declared dependency

**Issue**

`"info": "npx scripts-info"` calls the binary through `npx` even though `scripts-info` is a
`devDependency` (`package.json:266`) already installed in `node_modules/.bin`. The bare
`scripts-info` would resolve the local binary directly; the `npx` wrapper adds a lookup/prompt path
for no reason. Meanwhile `dev:kill` (`npx kill-port …`) and `update:browserslist`
(`npx update-browserslist-db@latest`) *correctly* use `npx` for packages that are **not**
dependencies. So the same `npx` prefix means two different things across the script block, and the
one case that doesn't need it is the one that has it.

**Fix**

Changed `scripts.info` to invoke the declared local `scripts-info` executable directly, preserving
the existing script-table behavior and intentional on-demand `npx` usage.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099433939) · 2026-07-28
03:02:13 UTC</sub>

### 0b3ab68e4ade — [P4][consistency] Ignore-glob style differs across eslint / dprint / prettier for the same paths

**Issue**

The three tools spell equivalent excludes differently: eslint uses `**/build/` and blanket
`android/` + `ios/`; dprint uses `web/build`, `android/**/build`, `ios/**/build`; `.prettierignore`
uses `**/build/` and blanket `android/` + `ios/`. The dprint narrowing is *intentional* (it must
still format generated `android/**/*.md`), but nothing in the files says so, so the divergence reads
as an accident and invites a "fix" that would either over- or under-format. Style also varies
(`**/build/` vs `web/build`) for what is meant to be the same directory.

**Fix**

Standardized dprint build exclusions to `**/build` and documented why native source directories
remain in Markdown formatting scope.

*Revised before approval:* Scoped dprint build exclusions to generated web, Android, and iOS output
so build-named committed skill Markdown remains formatted.

*Revised before approval:* Normalized the web build-output exclusion to `**/web/build/` while
preserving the narrow Android and iOS build scopes.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `dprint.json`’s new `**/build` exclusion also removes the tracked `.ruler/skills/build/SKILL.md`,
  `.agents/skills/build/SKILL.md`, and `.claude/skills/build/SKILL.md` from Markdown formatting.
  Keep the build-output exclusions scoped to `web/`, `android/`, and `ios/` so committed skill
  documentation remains covered.
* The range leaves the original glob-style inconsistency intact: `dprint.json:20` still uses
  `web/build` while `eslint.config.js:15` and `.prettierignore:2` use `**/build/`. Normalize the
  identical web-build exclusion without broadening dprint’s intentionally narrow native/build scope.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099434224) · 2026-07-28
03:02:15 UTC</sub>

### afc3d61a5c5e — [P4][consistency] `.vscode/settings.json` wires a formatter only for markdown, not for code

**Issue**

`extensions.json` recommends `dprint.dprint`, `esbenp.prettier-vscode`, and `svelte.svelte-vscode`,
but `settings.json` sets `editor.defaultFormatter` only for `[markdown]` (→ dprint). It never sets
Prettier as the default formatter for `.ts`/`.js`/`.json`/`.svelte`, nor `editor.formatOnSave`. A
contributor who installs the recommended extensions still gets no Prettier-on-save for code and may
default to VS Code's built-in formatter, producing diffs `format:check` then rejects.

**Fix**

Configured the workspace to format TypeScript, JavaScript, JSON, and Svelte with their recommended
extensions and enabled format-on-save, while retaining Markdown's dprint settings.

*Revised before approval:* Added the JSONC formatter association so VS Code configuration files use
the workspace-selected Prettier formatter.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Add an `[jsonc]` formatter association for `esbenp.prettier-vscode`; VS Code opens configuration
  files such as `.vscode/settings.json` in `jsonc` mode, so the current `[json]` block leaves those
  files on the built-in formatter and does not fully resolve the configuration-formatting drift.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099434486) · 2026-07-28
03:02:18 UTC</sub>

### ccc4dacefdb8 — [P2][platform-branching] Install-prompt module branches on `isNative()` at runtime where it could be a build-time exclusion

**Issue**

The install feature is dead inside the native shell yet ships in the native bundle, gated three
times at runtime: the module-load `beforeinstallprompt`/`appinstalled` listener block
(`if (browser && !isNative())`), an `isNative()` early return inside `initInstallPrompt()`, and an
`if (!isNative())` guard at the `+page.svelte` call site. CLAUDE.md's rule says `CAPACITOR=true` is
the single signal for web-vs-native branching; guarding on the compile-time literal
`__IS_CAPACITOR__` would let Rollup drop the code from the native bundle, where `isNative()` cannot
tree-shake.

**State at triage (2026-07-27):** Substantially drifted since f934d43 — the finding is one-third
resolved and the codebase has grown the exact convention that resolves the deferral blocker: …

**Fix**

Updated both install-state platform decisions to combine `__IS_CAPACITOR__` with `isNative()`,
eliminating web-build runtime checks while preserving native-shell no-op behavior and test
steerability.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/install-banner.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100073661) · 2026-07-28
04:46:55 UTC</sub>
