# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit

### [Maintainability] The shared `verify-access-code:` rate-limit bucket is charged inconsistently, so a valid family behind one NAT can be locked out of their first generation

**File(s):** `web/src/routes/api/verify-access-code/+server.ts` (`POST`, line 17),
`web/src/lib/server/generationAuthorization.ts` (`authorizeGenerationRequest`, lines 26–33)

#### Problem

`generationAuthorization` deliberately peeks the shared oracle bucket and charges **only failures**,
with a comment promising legitimate callers never consume it:

```ts
// generationAuthorization.ts:26–33
const guessKey = `verify-access-code:${input.clientAddress}`;
const guess = peekRateLimit(guessKey);
if (guess.limited) return throttled(guess.retryAfter);
if (typeof input.token !== 'string' || !(await isAllowedToken(input.token))) {
  rateLimit(guessKey); // charge only on a bad token
  throw error(403, 'Invalid access token');
}
```

But `/api/verify-access-code`, which shares the identical bucket key, charges **every** request —
successes included — before the code is even checked:

```ts
// verify-access-code/+server.ts:15–18
const { limited, retryAfter } = rateLimit(`verify-access-code:${getClientAddress()}`);
if (limited) return throttled(retryAfter);
```

The two endpoints share one 10/min bucket with opposite charging policies. A parent who re-enters a
*correct* access code a handful of times (a typo-then-fix, re-verifying on a second device on the
same home Wi-Fi) fills the bucket with **successful** verifications, and the next
`/api/generate-image` call is thrown a blind 429 at the peek — before its valid token is ever
checked. The "valid families behind one NAT never consume it" guarantee is defeated by the sibling
endpoint.

#### Proposed solution

Make `verify-access-code` follow the same peek-then-charge-only-failures discipline: `peekRateLimit`
first, and call `rateLimit()` only on the `!ok` branch. Better, lift the pattern into one shared
"credential oracle" helper both call sites use, so the charging policy can't drift again.

#### Verification

Unit-test with a stubbed `buckets` map: verify N successful `verify-access-code` calls, then assert
a subsequent `authorizeGenerationRequest` with a valid token is **not** throttled. Today it
throttles after 10 successes.

### [Maintainability] `engines.node` floor is below what the scripts actually require, and CI never tests it

**File(s):** `package.json` (`engines`, lines 5–7; the 10 `--experimental-strip-types` scripts
including `build:cap`), `.github/workflows/*.yml` (all pin `node-version: 24`)

#### Problem

The declared floor is

```json
"engines": { "node": ">=20.12" }
```

but 10 scripts launch Node with `--experimental-strip-types` (type-stripping landed in Node
**22.6**, unflagged in 22.18):

```json
"build:cap": "CAPACITOR=true node scripts/web.mjs vite build && node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/strip-native-assets.mjs",
```

`build:cap`, `check:assets`, `gen:tokens`/`gen:tokens:check`, `gen:style-covers`, and the coloring
generators all hard-fail on Node 20.12 with a bad-option error (and `strip-native-assets.mjs`
imports `books.ts` directly, so type-stripping is load-bearing). Every CI job pins
`node-version: 24`, so the declared minimum is never exercised — a contributor trusting `engines` on
Node 20 hits an immediate break with no CI signal.

#### Proposed solution

Raise `engines.node` to `>=22.6` (or `>=22.18`) to match reality. Optionally add a min-version
matrix leg to `test.yml` so the declared floor is actually verified.

#### Verification

`nvm use 20 && npm run build:cap` fails today with an unknown-option error; it should succeed on the
declared floor after the bump (or the floor should be raised to a version that does).

### [Performance] `commitStrokeGroup` runs the full `getHistoryDebug()` reduce on every stroke commit just to read one integer

**File(s):** `web/src/lib/drawing/engine.ts` (`commitStrokeGroup`, line 625),
`web/src/lib/drawing/undoHistory.ts` (`getHistoryDebug`, lines 800–822)

#### Problem

The pointerup commit path reads `pendingCommands` through the heavy debug aggregator:

```ts
} else if (rasterRects.length > 0 && getHistoryDebug().pendingCommands === 0) {
```

`getHistoryDebug()` walks the entire snapshot stack three times computing `liveRasters`,
`rasterBytes`, and `blobBytes` — all discarded here:

```ts
rasterBytes: snapshotStack.reduce(
  (n, s) => n + s.patches.reduce((m, p) => m + (p.canvas ? p.canvas.width * p.canvas.height * 4 : 0), 0), 0),
blobBytes: snapshotStack.reduce((n, s) => n + s.patches.reduce((m, p) => m + (p.blob?.size ?? 0), 0), 0),
```

For a 20-deep stack that's dozens of nested iterations on every crayon-stroke commit, inside the
pointerup hitch window the rest of the module works hard to keep small. It also couples a function
labeled a "Test/profiling seam" to production behavior.

#### Proposed solution

Add a cheap `pendingCommandCount(): number` (or `hasPendingCommands(): boolean`) export in
`undoHistory.ts` returning `pendingCommands.length`, and call that at line 625. Keep
`getHistoryDebug()` for the dev harness only.

### [Performance] Eliminate per-op / per-pointermove allocations in the drawing hot path

**File(s):** `web/src/lib/drawing/crayonBrush.ts` (`getCrayonPasses` lines 260–262, `paintCrayon`
line 137), `web/src/lib/drawing/engine.ts` (`syncCrayonOverlayMix` line 147; `draw` lines 884–895)

#### Problem

`getCrayonPasses()` clones the pass list on every call, and `paintCrayon()` calls it per op — during
a live stroke `renderOp`'s crayon branch invokes `paintCrayon` up to three times per op per frame
(buffer, mirror, paper-space buffer):

```ts
export function getCrayonPasses(): CrayonPass[] {
  return opts.passes.map((p) => ({ ...p })); // fresh array + objects, mid-stroke, per call
}
```

`syncCrayonOverlayMix` deep-clones the whole options object just to read one field
(`String(1 - getCrayonOptions().colorMix)`). And `draw()`, the hottest path, maps coalesced events
through two allocating passes every pointermove:

```ts
const screenPoints = events.map(pointerToScreen); // new array + K objects
const points = screenPoints.map(screenToPaper); // another new array + K objects
```

#### Proposed solution

Give internal read-only callers non-cloning accessors (iterate `opts.passes` directly inside
`paintCrayon`; add a direct `colorMix` getter), keeping the cloning
`getCrayonPasses`/`getCrayonOptions` for the public API only. Fold `draw()`'s two transforms into a
single pass to paper coordinates, reusing a module-level scratch array where the rare edge-swipe
guard still needs screen space.

#### Verification

Capture a crayon-scribble profile with `npm run perf:web` before/after; allocation/GC time in the
pointermove path should drop.

### [Maintainability] Op padded-bounds math is duplicated across two modules and has already diverged

**File(s):** `web/src/lib/drawing/undoHistory.ts` (`opPaddedBounds`, lines 313–342),
`web/src/lib/drawing/strokeOps.ts` (`renderOp` crayon-bounds block, lines 512–531)

#### Problem

Two independent implementations compute an op's padded bounding box, and they must agree for undo to
restore exactly what was painted. The undo path scales the pad by the widest crayon pass:

```ts
const scale = op.crayon && !op.erase && !op.magic ? crayonScale : 1;
const pad = (op.lineWidth / 2) * scale + PATCH_AA_PAD;
```

while the live-render path uses a fixed pad, no scale, and spells `PATCH_AA_PAD` as a bare `+2`:

```ts
pad = op.lineWidth / 2 + 2;
```

They already differ on the dev-harness `widthScale > 1` case — the undo comment even flags the
hazard, but the live path it must match doesn't apply the scale.

#### Proposed solution

Extract one `boundsForOp(op, crayonScale)` into the module that owns the op vocabulary
(`strokeOps.ts`) and call it from both the live renderer and the undo capture. Export `PATCH_AA_PAD`
and use the named constant in both.

### [Architecture] Consolidate the duplicated `/api` rate-limit, bounded-body, and throttle plumbing into shared helpers

**File(s):** `verify-access-code`, `verify-key`, `report`, `csp-report`, `admin/login/+server.ts`,
`admin/+page.server.ts` (rate-limit key + `throttled`); `generate-image/+server.ts` (84–92) and
`csp-report/+server.ts` (115–122) (bounded-body read); `web/src/lib/server/rateLimit.ts` (28–49 vs
59–68)

#### Problem

Three near-identical idioms recur across the server layer:

1. The `rateLimit(\`name:${getClientAddress()}\`)`+`if (limited) return
   throttled(...)`pair is
   copy-pasted at six call sites — and`admin/+page.server.ts`re-implements it by hand with a
   *different* 429 body, duplicating the message string inside`throttled()`and violating the "one
   true 429" the`server-api.md`
   rule promises:

   ```ts
   // admin/+page.server.ts
   if (limited) return fail(429, { loginError: `Too many attempts. Please wait ${retryAfter}s.` });
   ```

2. The "reject on declared `content-length`, then re-check actual bytes after reading" guard is
   hand-rolled twice with subtly different shapes (`arrayBuffer` + `throw` vs `text` + `TextEncoder`
   * `Response`).

3. `rateLimit` and `peekRateLimit` independently recompute the same window filter and
   `retryAfter = Math.max(Math.ceil((hits[0] + windowMs - now) / 1000), 1)`.

#### Proposed solution

In `lib/server/http.ts` add `enforceRateLimit(name, event)` (builds the key, calls `rateLimit`,
returns `throttled(...)` or `null`) plus `readBoundedBytes/Text(request, max)`; route the `/admin`
action through a shared `rateLimitStatus()` + message constant so both paths format identically. In
`rateLimit.ts`, factor a private `activeHits(key, windowMs, now)` and `retryAfterFor(...)` used by
both public functions.

### [Architecture] Unify the two incompatible error-response contracts across `/api`

**File(s):** `generationAuthorization.ts` (32), `generate-image/+server.ts` (111, 143),
`admin/tokens/+server.ts` (28, 50–54) vs `verify-access-code` (22, 27), `verify-key` (20, 25),
`report` (73), `admin/login` (27)

#### Problem

Some endpoints signal failure with a JSON `{ ok:false, error }` body; others throw SvelteKit
`error()`, which serializes as `{ message }`. `admin/tokens` alone answers a 401 with `{ message }`
but a 400/409 with `{ ok:false, error }`:

```ts
throw error(401, 'Unauthorized'); // → { message }
return json({ ok: false, error: message }, { status: 409 }); // → { ok:false, error }
```

And the three unauthenticated secret oracles disagree on status for the same "wrong credential"
case: `verify-access-code`/`verify-key` return **HTTP 200** with `{ ok:false }`, while `admin/login`
and generate-image return **403**. The client only copes by dumping raw `.text()` into a `detail`
field.

#### Proposed solution

Pick one failure contract for `/api` and document it in the `api` skill. Simplest: a
`jsonError(status, message)` helper returning `{ ok:false, error }` with the real status code, used
everywhere — replacing the bare `error()` throws in the auth path. At minimum align `admin/tokens`'
401 with its 400/409 shape.

### [Architecture] Break up the `ActionsPanel.svelte` god-component (~975 lines)

**File(s):** `web/src/lib/components/ActionsPanel.svelte` (whole file)

#### Problem

The component owns the brush menu, stroke-width flyout, coloring-book launch, screenshot save, AI
generation, undo (plus an end-of-history nudge and a Ctrl/Cmd-Z keyboard handler), the collapsible
drawer, outside-click flyout dismissal, an `<html>`-attribute-publishing `$effect` that writes eight
attributes on any change to a dozen deps, and a large block of measured layout math. It is the
hardest component in the app to test or change safely, and it duplicates the action-button size
formula between JS (lines 107–113) and CSS `--action-btn-fallback` (640–643, 678–681) with "keep in
sync" comments.

#### Proposed solution

Extract the two flyouts into `BrushMenu.svelte` / `StrokeWidthFlyout.svelte` (they already share a
`flyout-*` CSS vocabulary), move the `<html>`-publish effect into a `publishActionPanelState()`
helper in `actionButtonLayout.svelte.ts`, and lift the undo/keyboard logic into the tool/undo state
module. Emit the fallback size constants as CSS custom properties seeded in `app.html` so JS and CSS
read one source instead of mirroring a `min(...)` formula.

### [Architecture] Move AI-credential verify/classify logic out of `AiKeyManager.svelte` into a testable module, and dedupe the hand-rolled latest-request guard

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte` (`verifyAndSave` 79–119,
`submitKey` 121–169, classifier ~93), `web/src/lib/components/parent/ReportForm.svelte` (33–34,
65–68, 89, 100)

#### Problem

`AiKeyManager` owns genuine business logic in a UI callback: which credential type was entered,
which endpoint verifies it, and the whole success/persist/failure state machine. The domain rule is
buried in the component:

```ts
// Gemini keys look like "AIza…"; anything else is a managed access code.
const looksLikeApiKey = /^AIza/.test(value);
```

None of it is unit-testable without mounting the component and stubbing `fetch`. Separately, both
`AiKeyManager` and `ReportForm` independently reimplement the same "ignore this response if a newer
submit superseded it" AbortController + counter guard, with different names (`activeVerification` /
`verificationController` vs `requestId` / `controller`) and subtly different structure.

#### Proposed solution

Extract `verifyCredential(value)` and the `looksLikeApiKey` classifier into
`$lib/state/settings.svelte.ts` (or a new `$lib/aiCredential.ts`), leaving the component only
status/message wiring. Extract a `createLatestRequest()` helper
(`{ begin(): { id, signal }, isCurrent(id) }`) and use it in both components so the concurrency
guard is reviewed once.

### [Maintainability] Consolidate the two parallel "system dark" trackers and theme resolvers

**File(s):** `web/src/lib/theme.ts` (`systemPrefersDark`/`resolveTheme` lines 40–47),
`web/src/lib/state/appearance.svelte.ts` (lines 8–20)

#### Problem

Two modules each open their own `matchMedia('(prefers-color-scheme: dark)')`, each register a
`change` listener, and each implement the same preference→resolved-theme computation:

```ts
// theme.ts
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}
```

```ts
// appearance.svelte.ts
const systemQuery = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-color-scheme: dark)')
  : null;
systemQuery?.addEventListener('change', (e) => {
  appearance.systemDark = e.matches;
});
export function resolvedTheme(): 'light' | 'dark' {/* same logic, reactive */}
```

Two independent media-query subscriptions with no ordering guarantee can momentarily disagree during
an OS theme switch, and the resolution logic must be kept in lockstep by hand.

#### Proposed solution

Have `theme.ts` own a single reactive `systemDark` `$state`, and derive both `updateThemeColorMeta`
and `resolvedTheme()` from it (or have `appearance` import `resolveTheme` from `theme.ts`) — one
subscription, one resolver.

### [Maintainability] Eliminate cross-module `getElementById` coupling in the export/animation paths

**File(s):** `web/src/lib/drawing/overlay.ts` (`getActiveOverlayImage`, lines 1–6; consumed by
`screenshot.ts`, `saveOnDelete.ts`, `aiImage.ts`), `web/src/lib/components/InstallBanner.svelte`
(line 54)

#### Problem

Engine/export code resolves other components' DOM by magic string. The coloring overlay is fetched
by id from inside the export pipeline:

```ts
const el = document.getElementById('coloringOverlay') as HTMLImageElement | null;
```

and `InstallBanner` flies into the Parent Help button by querying *its* id:

```ts
const target = document.getElementById('parentHelpButton')?.getBoundingClientRect();
```

A rename of either id silently breaks save/AI/export (or the banner animation) with no type error,
and neither path has a test seam that can inject the element.

#### Proposed solution

Have the owning components register these elements/positions through the existing `layout`/`ui`
state or an engine setter (mirroring `adoptDrawingCanvas`/`setSafeAreaInsets` and the `buttonCenter`
the UI already publishes for modal origins). The DOM lookup becomes a fallback, and tests can set
them explicitly.

### [Maintainability] Give the durable-restore reload a registry instead of a hand-maintained fan-out

**File(s):** `web/src/routes/+page.svelte` (lines 125–129), `web/src/lib/state/settings.svelte.ts`
(`reloadSettings` 248), `strokeWidth.svelte.ts` (`reloadStrokeWidth` 33), `tool.svelte.ts`
(`reloadBrushType` 80)

#### Problem

After the native durable mirror recovers evicted values, every persisted store must be manually
re-read at one call site:

```ts
hydrateDurableStorage().then((restored) => {
  if (restored) {
    reloadSettings();
    reloadStrokeWidth();
    reloadBrushType();
```

Each new persisted store module reintroduces the footgun: add a store, forget its `reload*()` here,
and native values silently fail to restore after a WebView eviction. Nothing tests for a missing
entry.

#### Proposed solution

Have `storage.ts` expose an `onDurableRestore(cb)` registry each store subscribes to at init;
`hydrateDurableStorage()` invokes all registered callbacks when it returns `restored`, so a store
wires its own reload and the call site can't omit one.

### [Maintainability] Replace hand-mirrored parallel lists that silently drift

**File(s):** `web/src/lib/state/colors.svelte.ts` (`PALETTE_COLORS` 20–31 vs `TRIM_ORDER` 44–55),
`web/src/lib/components/Icon.svelte` (`COLOR_ICONS` allowlist 21–48), `web/src/lib/state/books.ts`
(`page()` orientation args, ~48 call sites 121–304)

#### Problem

Several structures re-encode data that lives elsewhere, kept in sync only by hand:

* `TRIM_ORDER` re-lists all ten palette hex strings in a second order; editing a swatch hex in
  `PALETTE_COLORS` without mirroring it here silently stops that swatch trimming.
* `Icon.svelte`'s `COLOR_ICONS` is a literal allowlist deciding which icons opt out of the
  monochrome tint; a new colored SVG renders wrongly tinted until someone remembers to append it.
* Every book page passes `['portrait', 'landscape'], ['portrait', 'landscape']` for night/chalk — 96
  identical array literals that bury any real per-page difference.

#### Proposed solution

Declare each datum once: give `PaletteColor` a `trimPriority` (derive `TRIM_ORDER` from it);
classify color icons from the asset (a `*.color.svg` convention or a `gen:icons`-emitted manifest)
instead of a parallel set; flip `page()`'s night/chalk default to all-orientations and pass only the
subtractive exceptions.

### [Performance] `measureSafeAreaInsets` forces a synchronous reflow on every unthrottled resize

**File(s):** `web/src/lib/safeArea.ts` (lines 16–37), `web/src/lib/state/layout.svelte.ts`
(`syncViewport` 55–64, listeners 68–78)

#### Problem

`syncViewport` runs on `resize`, `orientationchange`, and `visibilitychange` with no debounce/rAF,
and each call appends a probe, reads its rect, reads `documentElement` metrics, then removes it — a
forced style/layout flush:

```ts
document.body.appendChild(probe);
const rect = probe.getBoundingClientRect();
const { clientWidth, clientHeight } = document.documentElement;
probe.remove();
```

`resize` fires many times per second during a desktop window drag or a mobile URL-bar animation,
each one flushing layout on the main thread that also runs drawing.

#### Proposed solution

Coalesce `syncViewport` into a single `requestAnimationFrame` (drop duplicate frames), and/or cache
the last insets and skip the DOM probe when `viewportWidth/Height` are unchanged.
