# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Lighthouse page-load audit

Audited 2026-09-22 with Lighthouse 12.8.2 (simulated Slow 4G + 4× CPU) against production
`splotch.art` at d8a8102, then against the `feature/lighthouse-tuning` branch preview carrying the
fixes in PR (see the log entry). Four production runs of the phone-first cell across this and the
2026-07-22 audit spanned Perf 82–97, so single-run deltas under ~5 points are noise.

| Cell                    | Production (before)                          | Preview (after)                                    |
| ----------------------- | -------------------------------------------- | -------------------------------------------------- |
| phone first             | Perf 94 · LCP 1.9 s · TBT 280 ms             | Perf 98 / 96 / 98 · LCP 1.2 s · TBT 160–210 ms     |
| phone repeat            | Perf 94 · LCP 1.4 s · TBT 280 ms             | Perf 99 · LCP 1.2 s · TBT 120 ms                   |
| tablet first            | Perf 97 · LCP 1.9 s · TBT 190 ms             | Perf 97 · LCP 1.2 s · TBT 200 ms                   |
| tablet repeat           | Perf 97 · LCP 0.9 s · TBT 210 ms             | Perf 99 · LCP 1.2 s · TBT 130 ms                   |
| phone first, dark theme | Perf 96 · LCP 1.8 s · TBT 200 ms             | Perf 98 · LCP 1.2 s · TBT 140 ms                   |
| phone first, bare       | Perf 98 · LCP 1.9 s · TBT 151 ms             | Perf 97 · LCP 1.8 s · TBT 170 ms (before inlining) |
| phone first, everything | Perf 96 · LCP 1.9 s · TBT 220 ms · CLS 0.016 | not re-run                                         |

A11y, Best Practices and SEO were 100 in every cell. "Everything" seeds dark theme, bare toolbar,
open drawer, AI enabled, reduced motion and a 120% button scale. First-visit transfer was 623 KB in
every production cell, 47% of it the deliberate post-LCP pencil-sound prefetch (three MP3s, 240 KB).

Where the score went, on the phone-first cell: TBT scored 81 and LCP 98; everything else scored 98
or better. The whole TBT was one boot task (module evaluation of the startup graph, then SvelteKit
hydration in the same task's microtask checkpoint): 85 ms observed, ~340 ms simulated. A throttled
`perf:web:mount` profile of an unminified build put that task at 475 ms and attributed it:

| Slice                                                                  | Throttled ms | Fixed in the PR |
| ---------------------------------------------------------------------- | -----------: | --------------- |
| `new AudioContext()` from `preloadFirstDrawSound` at module evaluation |           73 | yes             |
| Engine boot (`initDrawingCanvas`, 60 tile contexts, first resize)      |          ~90 | no              |
| Other module bodies (state installs, icons, Svelte runtime)            |          ~40 | no              |
| Hydration: Svelte claiming the toolbar DOM                             |         ~230 | no              |
| Hydration: forced style recalc from the toolbar-style effect           |        13–26 | yes             |
| Hydration: redundant `resizeCanvas` from the same effect               |          ~15 | yes             |

Post-boot, the crayon tooth-field prebuild ran as one 80–120 ms idle task inside the TBT window; the
PR slices it per octave. The LCP resource — the paper texture, 17.6 KB behind the forty
modulepreloaded chunks — is now a 7.8 KB data URI in the document, so LCP equals FCP (1.2 s on the
preview against 1.8–1.9 s before). The remaining findings below are what the PR did not take on.

### [Performance] Hydration of the drawing route is ~240 ms of the ~400 ms throttled boot task

**File(s):** `web/src/routes/+page.svelte`, `web/src/lib/components/ActionsPanel.svelte`,
`web/src/lib/components/ColorPalette.svelte`, `web/src/lib/components/DrawingCanvas.svelte`

#### Problem

After the PR, the phone boot task is ~400 ms at 4× CPU (Lighthouse's simulation) and 240 ms of it is
`RunMicrotasks` under `BlinkScheduler_PerformMicrotaskCheckpoint`: SvelteKit's `_hydrate` walking
the prerendered toolbar (558 DOM elements, twenty inline SVG icons, the palette's swatches, the
actions panel's flyouts). No single function dominates — the top self-time entries are Svelte's
`update_reaction`/`update_derived`/`mark_reactions` and `set_attribute`, spread across dozens of
components — so this is a volume problem, not a hot spot. It is the entire remaining TBT: the score
cannot reach 100 while one task stays above ~150 ms simulated.

Two mechanisms make it worse than it needs to be:

* Module evaluation and hydration run in one task because SvelteKit's boot script calls `start()`
  from the `import()` continuation of the same task that evaluated the module graph. Splitting them
  would not reduce work, but Lighthouse charges each task 50 ms less blocking time, and the engine
  boot (which must precede hydration, ADR-0072) would stop extending the hydration task.
* Everything the drawing route renders hydrates at once, including chrome a child does not touch in
  the first seconds (the settings button, the clear button's tutorial geometry, the notch band).

#### Proposed solution

Measure before choosing; candidates in rising order of invasiveness:

1. Hydrate the below-the-fold/late chrome lazily: keep the prerendered markup for first paint but
   mount `SettingsButton`, `ClearButton` and `NotchBand` from an idle callback the way the
   boot-hidden overlays already do (ADR-0049), so their subtrees are not claimed during the boot
   task.
2. Yield between engine boot and hydration: SvelteKit exposes no hook, but the engine's `earlyBoot`
   could defer its heavier half (`resizeCanvas` → tile allocation) to a `queueMicrotask` boundary
   that hydration does not await, or a `requestAnimationFrame`, so the first paint task carries only
   what strokes need.
3. Reduce the hydrated node count: the twenty startup icons are inlined SVG that Svelte still claims
   node by node; rendering them through `{@html}` (already the `Icon.svelte` path) is cheap, but the
   swatch and action-button lists each carry per-item `$derived` reads that run at claim time.

#### Verification

`npm run perf:web:mount -- --device=phone` on a `PERF_MARKS=true` build made with
`node tools/run-web-tool.mjs vite build --minify false`, then attribute the boot task with a CPU
sample aggregate restricted to that task's window (the PR's `lighthouse-reports/cpuwindow.mjs`
approach: sum `ProfileChunk` self time by function inside the `RunTask`). The boot task's
`RunMicrotasks` slice is the number to move. Confirm on the Lighthouse phone-first cell against a
`feature/*` preview: TBT is the only sub-95 weighted audit left.

### [Performance] Palette bottom padding is prerendered as 8 px and recomputed at hydration

**File(s):** `web/src/lib/components/ColorPalette.svelte` (`paletteBottom`, lines 4–8, 125)

#### Problem

The palette's bottom padding is a `$derived` that resolves to `8` during prerender
(`layoutState.viewportWidth` is 0 on the server) and to
`8 + renderedActionButtonSize() / 2 - 30 + layoutState.safeArea.bottom` after hydration. On the
emulated phone both come out at 8 px, but any device with a bottom safe-area inset (every notched
iPhone, Android gesture navigation) or a non-default button scale gets a different value the moment
hydration runs — after first paint on a slow device — and the space-between swatch grid moves every
swatch. Lighthouse's phone cell cannot see it (inset 0, scale 100), yet one local run of the same
build did record a 0.012 shift on a swatch, and the "everything" production variant (button scale
120%) recorded CLS 0.016 on the bare toolbar's glass pane from the same class of mismatch. CLS is
25% of the performance score, so on real devices this is worth more than the remaining LCP.

#### Proposed solution

Express the padding in CSS so the prerendered value is already the final one:
`--palette-bottom: max(0px, calc(8px + var(--action-btn-size) / 2 - 30px + var(--safe-area-bottom)))`
with `--action-btn-size` published by the same CSS that sizes the buttons (the `--action-btn-scale`
custom property the app.html boot script already stamps). Then the component sets nothing at
hydration. The bare toolbar's glass panes need the same treatment for whatever geometry the
`GlassPanes` mount computes from `layoutState`.

#### Verification

Run the `audit-page-load` driver on a phone profile with
`--storage "splotch-action-button-scale=120"` and, separately, emulate a bottom inset through the
`/dev/notch` harness (`docs/SAFE-AREA.md`); `cumulative-layout-shift` must stay 0 and the
`layout-shifts` audit empty. `safe-area-matrix.spec.ts` is the place for a regression check.

### [Performance] SvelteKit fetches the error route's chunks and stylesheet on every load

**File(s):** `node_modules/@sveltejs/kit/src/runtime/client/client.js` (`default_error_loader`, line
369), `web/src/routes/+error.svelte`

#### Problem

SvelteKit's client `start()` calls `void default_error_loader()` eagerly, so every load of `/` also
fetches `nodes/1.*.js`, its shared chunks and `ErrorScreen.*.css` (five requests, ~4 KB) right after
hydration, at High priority, in the window where the paper texture and pencil sounds are still
downloading. It is framework behaviour and the bytes are small; the cost is the request slots.

#### Proposed solution

Nothing app-side removes it cleanly. Options: an upstream issue/PR making the error loader lazy (or
`requestIdleCallback`-deferred); or make `+error.svelte` import `ErrorScreen` dynamically so at
least the stylesheet stops being fetched. Low value; file only if a later audit shows those requests
delaying the LCP resource.

#### Verification

`network-requests` in a phone-first report: `nodes/1.*.js` and `ErrorScreen.*.css` appear ~950 ms
after navigation start.

## Source: Compatibility audit

### [Docs] Record that the `-webkit-backdrop-filter` twin is load-bearing at the floor

**File(s):** `docs/COMPATIBILITY.md` ("Polyfills & workarounds", the `backdrop-filter` register
row); `web/src/app.css` (`.modal-dialog::backdrop`)

#### Problem

The "Polyfills & workarounds" bullet groups the prefixed `backdrop-filter` with the `100dvh` →
`100vh` fallback and says both "stay even though they're within the current floor — they cost
nothing and protect the few users between iOS 15.4 and 16.4 on the web." Neither half holds for
`backdrop-filter`. Unprefixed `backdrop-filter` first shipped in Safari and iOS **18** (web-features
3.39.0: `backdrop-filter`, Baseline low since 2024-09-16, `safari: 18`, `safari_ios: 18`), so on
every supported Safari from 16.4 through 17.x the `-webkit-backdrop-filter` declaration is the only
one that applies. It is not an optional fallback. The register row reinforces the misreading: its
Baseline cell says "Safari 9 (`-webkit-`)" and never says when the unprefixed property arrived.

The `100dvh` sentence is also muddled: `100dvh` is Baseline at Safari 15.4, so the `100vh` line
protects engines older than 15.4 (below the floor), not users "between iOS 15.4 and 16.4".

A later cleanup that trusts this bullet would delete the prefix and remove the modal scrim's blur on
every supported Safari below 18, with no test to catch it (Chromium CI never reads the prefixed
property).

#### Proposed solution

Rewrite the bullet so it separates the two cases: the prefixed `backdrop-filter` twin is required
until the Safari/iOS floor reaches 18, and the `100vh` line is a below-floor courtesy that costs one
declaration. Put the unprefixed Safari 18 version in the register row's Baseline cell. Consider
anchoring the row as `` `-webkit-backdrop-filter: blur(` + `backdrop-filter: blur(` `` (it already
is) and adding a note that the twin goes only with a Safari 18 floor.

#### Verification

`npm run report:browser-floor -- --feature backdrop-filter` prints "above floor: safari 18,
safari_ios 18". Re-read the bullet afterwards and confirm it no longer calls the prefix removable at
the current floor.

### [Docs] Correct the `text-wrap: pretty` Baseline cell in the risk register

**File(s):** `docs/COMPATIBILITY.md` (the `text-wrap: pretty` register row)

#### Problem

The row's Baseline cell reads "Chrome 117 / Safari 17.5". web-features 3.39.0 (`text-wrap-pretty`)
lists Chrome/Edge 117 and Safari/iOS **26**, and no Firefox support at all (Baseline `false`).
Safari 17.5 shipped `text-wrap: balance`, not `pretty`; the cell looks copied from the row above it.
The behavior column ("above floor; paragraphs may end on a short last line") is still right, so
nothing ships wrong today, but a floor decision that reads this cell would believe a Safari 17.5
floor retires the row.

#### Proposed solution

Change the cell to "Chrome 117 / Safari 26; not in Firefox". The Guarded and Behavior cells need no
change.

#### Verification

`npm run report:browser-floor -- --feature text-wrap-pretty` prints the engine list above.

### [Tests] Drift-guard the documented web floor against `BROWSER_TARGETS`

**File(s):** `docs/COMPATIBILITY.md` ("Supported browsers & devices" table, "How the floor is
enforced" table's web row); `docs/MOBILE/ios.md` (the web `build.target` note);
`web/src/browserFloor.test.ts`

#### Problem

Every native floor statement has a drift guard: `iosBeta.test.ts` ties `MIN_IOS_RELEASE` to the
Xcode project and to `docs/MOBILE/native.md`, and `android-config.test.mjs` ties `minSdkVersion` to
this document, the `mobile` skill and the `/beta` constants. The web floor has none. The supported
browsers table ("Chrome / Edge 111+", "Firefox 114+", "Safari 16.4+", "iOS / iPadOS Safari 16.4+")
and the enforcement table's value cell (`chrome111, edge111, firefox114, safari16.4, ios16.4`) are
maintained by hand. `browserFloor.test.ts` checks only that the WebKit entries in `BROWSER_TARGETS`
stay at or below `IPHONEOS_DEPLOYMENT_TARGET`. A floor raise that edits `web/browserTargets.ts` and
forgets the doc passes CI, and the document every future floor decision starts from then states the
old floor.

#### Proposed solution

Extend `web/src/browserFloor.test.ts` (it already imports `BROWSER_TARGETS`) to read
`docs/COMPATIBILITY.md` and assert that the enforcement table's web value cell equals
`BROWSER_TARGETS.join(', ')`, and that each supported-browsers row states the version its engine has
in `BROWSER_TARGETS`. Follow the context-anchored matching `android-config.test.mjs` uses for the
Android row, so an edit elsewhere in the table cannot satisfy it by accident.

#### Verification

Temporarily change `firefox114` to `firefox115` in `web/browserTargets.ts`: today
`npx vitest run web/src/browserFloor.test.ts` still passes; after the fix it fails naming the doc.

### [Cleanup] Remove or justify two guards on APIs every supported engine has

**File(s):** `web/src/lib/drawing/magicBrush.ts` (`typeof DOMMatrix !== 'undefined'`, in the Magic
sheet pattern transform); `web/src/lib/drawing/tiledRendererReadback.ts`
(`typeof createImageBitmap !== 'function'`, in `captureTiledCanvasReadback`)

#### Problem

Both probe an API that every engine at the floor supports and that the happy-dom unit-test
environment also provides. `DOMMatrix` is web-features `dom-geometry` (Chrome 61, Firefox 33, Safari
11). `createImageBitmap` already has a within-floor register row (Chrome 50, Firefox 42, Safari 15);
web-features lists `createimagebitmap` at Safari 17.2 only because it scores the complete feature,
every option included, and a `typeof` check tests nothing but the function's existence. Neither is
cited in the register, and neither is an SSR guard: both modules run only in the browser. The guards
therefore never fail in any environment the code runs in, but each one quietly changes behavior if
it ever did: the `DOMMatrix` one skips the pattern transform (a mis-registered Magic sheet), and the
`createImageBitmap` one silently disables the readback path. A reader has to work out that neither
branch is reachable.

By contrast, `typeof AudioContext`, `'fonts' in document`, and `typeof Worker` look the same but are
live: happy-dom lacks all three, so those guards keep unit tests running. They are not part of this
finding.

#### Proposed solution

Delete both conditions (keep the transform unconditional; drop the `createImageBitmap` clause from
the early return). If either turns out to protect a real environment (a worker context, a test file
that stubs the global away), keep it and add a one-line comment naming that environment instead.

#### Verification

`git grep -n "stubGlobal('createImageBitmap'\|stubGlobal('DOMMatrix'" web/src` finds no test that
removes either global for these modules. Delete the conditions and run
`npx vitest run web/src/lib/drawing` plus `npm run check`; both stay green.

### [Docs] Add the Cache Storage guard to the risk register

**File(s):** `web/src/lib/boot/coloringPacks.ts` (`webPackStorageExists`, `typeof caches`);
`docs/COMPATIBILITY.md` (API risk register)

#### Problem

`webPackStorageExists()` returns `false` when `caches` is undefined. Cache Storage is
secure-context-only, so this branch is live on any plain-HTTP origin (a LAN dev server, a
misconfigured host), not only on old engines. It is an optional-API guard with a distinct behavior
(web coloring packs cannot be stored at all), which is the kind of site the register exists to
record, but no row covers it: the Service Worker row cites `'serviceWorker' in navigator` only.
`npm run report:browser-floor` lists it as the one feature probe whose file the register never cites
and that is not a second instance of an existing row's pattern.

#### Proposed solution

Add a register row: Cache Storage (`caches`), Where
`` `lib/boot/coloringPacks.ts` → `typeof caches === 'undefined'` ``, Baseline from web-features
`service-workers`, which carries `api.Window.caches` ("Chrome 45 / Firefox 44 / Safari 11.1; secure
contexts only"), Guarded "✅ feature-detected", Behavior "web coloring packs are never downloaded or
reused on an insecure origin".

#### Verification

`npx vitest run tools/tests/compatibility-register.test.mjs` passes with the new anchor, and a rerun
of `npm run report:browser-floor` shows the site as cited.
