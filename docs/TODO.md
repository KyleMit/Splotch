# TODO

> Work through these items one at a time with `/fix-next-todo-manual`, or clear the whole list autonomously with `/fix-next-todo-auto`.
> After each fix: remove the completed item and run relevant type checks or tests.
> In manual mode, do **not** `git add` or `git commit` — the user reviews the diff first. Auto mode commits to its own branch/PR.

## Code audit (2026-07)

Findings from a full-repo audit pass, ordered by impact. Bugs and correctness first,
then performance, then maintainability/architecture sweeps.

### Bugs & correctness

- [ ] **[Bug] `dragToClear` ignores pointerId — a second finger can hijack the drag and wipe the canvas** — File(s): `web/src/lib/actions/dragToClear.ts`
  `onPointerDown` sets a bare `isDragging = true`, and the document-level `onPointerMove`/`onPointerUp`
  filter only on `isDragging`, never on `e.pointerId`. While finger A holds the trash button,
  finger B drawing on the canvas bubbles pointer events to `document` (the engine's `draw()`
  calls `preventDefault` but not `stopPropagation`): the trash transform and `--clear-progress`
  track finger B measured from finger A's start, and finger B's `pointerup` commits `onClear()` —
  wiping the drawing — whenever it lands ≥ the accept radius from finger A's start. Two-handed
  toddler input makes this a realistic accidental-wipe path. Fix: record `e.pointerId` on
  pointerdown and early-return in move/up for any other id; ideally `setPointerCapture` on the
  node and move the move/up listeners off `document`, which also removes two always-on
  document-wide listeners from the drawing hot path.

- [ ] **[Bug] Rate limiter's `Retry-After` can never unblock a compliant client** — File(s): `web/src/lib/server/rateLimit.ts` (lines 29–45)
  Rejected attempts are recorded as hits (`hits.push(now)` runs before the limit check), but
  `retryAfter` is computed as "when the oldest hit ages out" — while limited, each retry adds a
  hit, so a client that honors `Retry-After` exactly stays limited forever (with a misleading
  ~1s `retryAfter`) until it goes silent for a full window. Fix: check `hits.length >= limit`
  *before* pushing so rejected attempts don't count, which makes `retryAfter` from `hits[0]`
  honest. Affects all five call sites (admin login ×2, verify-access-code, verify-key,
  generate-image). `rateLimit.test.ts` doesn't pin the current behavior, so the change is safe;
  add a test that a client retrying after `retryAfter` succeeds.

- [ ] **[Bug] BYOK branch of `generate-image` is unauthenticated and unthrottled** — File(s): `web/src/routes/api/generate-image/+server.ts` (lines 83–117)
  Any non-empty `apiKey` skips both the allowlist check and the rate limiter, so a caller with a
  junk key gets free, unthrottled requests that each parse a ≤15 MB multipart body and trigger
  an outbound Gemini call — and the 502-vs-200 distinction is a key-validity oracle that
  bypasses `/api/verify-key`'s limiter, violating `.claude/rules/server-api.md` (every
  unauthenticated oracle must be rate-limited per IP). ADR-0014's "BYOK is intentionally not
  throttled" rationale only covers valid keys spending their own quota. Fix: add a per-IP
  `rateLimit(\`generate-image-byok:${getClientAddress()}\`, …)` with a generous limit in the
  BYOK branch, and update ADR-0014's wording in the same change.

- [ ] **[Bug] `blobs-smoke.mjs` failure cleanup is dead code — failed runs leave probe tokens in the production Blobs store** — File(s): `scripts/blobs-smoke.mjs` (lines 90–165)
  The FATAL catch does `if (ctx?.session && ctx?.probe) { …DELETE… }`, but `ctx` is only
  assigned when `run()` *resolves*, and `run()` only returns after its own DELETE already
  succeeded — so on any throw mid-run the cleanup never fires and the `blobs-smoke-<uuid>`
  token stays in the live site-wide allowlist (this runs on every deploy via `blobs-smoke.yml`).
  Fix: hoist `session`/`probe` to module scope, assign them as they're created, and do the
  DELETE in a `finally`.

- [ ] **[Bug] PWA update module: non-idempotent init, redirect-loop risk, debug leftovers** — File(s): `web/src/lib/pwa/updates.ts`, caller `web/src/routes/+page.svelte`
  (a) `/privacy` is client-side navigable from the About tab, so returning to `/` remounts
  `+page.svelte` and re-runs `initPWAUpdates()`: the `visibilitychange`/`focus` listeners
  duplicate and the previous hourly interval leaks (only the last one is ever cleared). Add a
  module-level `initialized` guard or return a teardown called from mount cleanup.
  (b) `initPWAUpdates` strips the `?v=` cache-bust param *before* `checkVersionMismatch()` runs,
  discarding the "already tried cache-busting" signal — a persistent mismatch (stale CDN edge)
  becomes a tight `location.replace` reload loop. Pass the stripped value through and skip the
  redirect when the fetched version equals it (one attempt per deployed version).
  (c) Remove the `updatefound` console-log block, the no-op `beforeunload` interval clear, and
  the catch-block `console.log`. All unit-testable in the existing `updates.test.ts`.

- [ ] **[Bug] `stopDrawing` fires `onDrawStop` while other fingers are still drawing** — File(s): `web/src/lib/drawing/engine.ts` (lines 871–903)
  The callback runs unconditionally on every `pointerup`/`pointerout`/`pointercancel` — even
  when `activePointers.size > 0` — so during a two-finger scribble the first lift kills the
  draw sound mid-stroke and the surviving finger's next move rebuilds a fresh source ramping
  from zero (audible stutter + timbre switch). Move the callback inside the existing
  `if (activePointers.size === 0)` block alongside `commitActiveCommand()`. This is the mirror
  image of the tracked BACKLOG bug (`releaseAllPointers` never fires the callback) — one fires
  too rarely, this too eagerly; fix both together.

### Performance

- [ ] **[Perf] ColorPicker drag scans ~81 hexagons with `getBoundingClientRect` per pointermove** — File(s): `web/src/lib/components/ColorPicker.svelte` (lines 153–205)
  While dragging, pointer positions in clip-path gaps (the common Apple Pencil case this code
  exists for) fall through to `findNearestHexagon`, which runs `querySelectorAll('.hexagon')`
  plus a rect read per hexagon per move — and each move's `hoveredHex` class flip invalidates
  layout, so the next move's reads force a fresh reflow (~81 forced-layout reads per pointer
  event). The grid is static while the dialog is open: snapshot `{ hex, cx, cy }` centers once
  on pointerdown or dialog open (invalidate on resize) and do nearest-neighbor math against the
  cached array; `document.elementFromPoint` can be dropped once centers are cached.

- [ ] **[Perf] `resizeCanvas` does an unthrottled wipe + command replay on every resize event** — File(s): `web/src/lib/drawing/engine.ts` (lines 282–319, listener ~1037)
  A desktop window-edge drag fires resize continuously; each event runs backing-store
  reassignment (which wipes the canvas), possible `growCanvas` reallocation + copy, and
  `rebuildFromBaseline()` replaying the command log (bounded — `paintStateThrough` blits from
  the most recent keyframe when one exists and the log is op-simplified and capped — but still
  a full redraw per event). Coalesce with rAF or a short
  trailing debounce: run `refreshCanvasRect()` immediately so pointer mapping stays correct,
  defer the backing-store rebuild to the settled size. Keep the mid-stroke `activeCommand`
  replay working for the final rebuild. Web target only (mobile rotation is a single event).

- [ ] **[Perf] Web bundle ships and SW-precaches native-only Capacitor chunks (~16 KB measured in one build)** — File(s): `web/src/lib/orientation.ts`, `web/src/lib/haptics.ts`, `web/src/lib/storage.ts`, `web/src/lib/secureStorage.ts`, `web/src/lib/state/network.svelte.ts`, `web/src/lib/drawing/screenshot.ts`, `web/src/lib/components/DrawingCanvas.svelte` (via `$lib/plugins/pencilEraser`), `web/src/lib/components/NotchBand.svelte`, `web/src/lib/platform.ts`
  Chunks for `@capacitor/core`, status-bar, haptics, screen-orientation, preferences, network,
  community media, pencilEraser, and DeviceLock ship in the web output and `sw.js` precaches
  all of them, though every call site is gated on `isNative()` — always false on web (the
  ~16 KB figure came from one `npm run build`; re-measure, since the plugin wrappers in
  `web/src/lib/plugins/` also statically pull `@capacitor/core`). Use the literal
  `__IS_CAPACITOR__` at each branch/thunk site so Vite's define substitution lets Rollup drop
  the dynamic imports (`isNative()` is a runtime `globalThis.Capacitor` check that can't
  tree-shake across modules) — this is the CLAUDE.md single-signal rule. Note
  `+page.svelte`'s `isNative()` gate imports no plugin, so it needs no change.
  Caveats: add `__IS_CAPACITOR__` to `web/vitest.config.ts` defines (or keep `typeof` guards);
  iOS-vs-Android `getPlatform()` checks must stay runtime (one native bundle). Touch one gate
  at a time and re-verify the native build still loads plugins.

### Maintainability & architecture

- [ ] **[Maint] Five components independently re-implement orientation/viewport tracking** — File(s): `web/src/lib/components/ActionsPanel.svelte`, `ColoringBook.svelte`, `ClearButton.svelte`, `NotchBand.svelte`, `DrawingCanvas.svelte`, `web/src/lib/state/layout.svelte.ts`, `web/src/lib/safeArea.ts`
  Each component wires its own `resize` + `orientationchange` listeners (ColoringBook adds a
  redundant `screen.orientation` listener and a `matchMedia` change listener on top).
  ActionsPanel, ColoringBook, and NotchBand each keep private `isPortrait`/`orientation` state
  and re-create `window.matchMedia(...)` inside resize callbacks; ClearButton calls a plain
  `isPortrait()` helper to reset its position, and DrawingCanvas only re-pushes safe-area
  insets — so the consolidation is state for the first three, listener dedup for all five.
  Extend the existing rune-module precedent (`layout.svelte.ts`) with
  orientation + safe-area-inset fields updated by one listener pair installed once; components
  `$derived` off it. While there, collapse `measureSafeAreaInsets()` from four separate DOM
  probes (append + force-layout + remove, ×2 callers per resize event) to a single fixed
  probe positioned by all four `env(safe-area-inset-*)` values and one rect read. Verify
  NotchBand still measures insets after rotation settles.

- [ ] **[Arch] TabPager tab registration has no teardown** — File(s): `web/src/lib/components/TabPager.svelte` (101–116, 143–152), `web/src/lib/components/TabPagerTab.svelte` (16–18), `web/src/lib/components/tabPagerContext.ts`
  `TabPagerTab` registers via `$effect(() => pager.registerTab(...))` with no cleanup return, so
  a conditionally-rendered tab (the BACKLOG's "remove install-instructions tab on native"
  direction makes this imminent) leaves a ghost entry and rendered panel behind, and `activeTab`
  can point at it. Return a teardown from the effect that splices the tab out and re-clamps
  `activeTab`/`scrollProgress`; mutate the `$state` array in place instead of reassigning.
  Also rename the `TabPagerTab` interface in `tabPagerContext.ts` (it collides with the
  component name) to something like `TabDescriptor`.

- [ ] **[Maint] JSON-body parsing and 429 shaping copy-pasted across every endpoint, with three divergent 429 contracts** — File(s): `web/src/routes/api/verify-access-code/+server.ts`, `verify-key/+server.ts`, `admin/login/+server.ts`, `admin/tokens/+server.ts`, `generate-image/+server.ts`, `web/src/hooks.server.ts`, `web/src/app.d.ts`
  Five copies of the identical `try { await request.json() } catch { throw error(400, …) }`
  block across four endpoints — verify-access-code, verify-key, admin/login, and admin/tokens
  (which has two: POST and DELETE); generate-image parses `formData()` and has no such block —
  and three different 429 body shapes (two JSON variants + one text/plain). Extract
  `readJsonBody(request)` and a `throttled(retryAfter)` helper into `web/src/lib/server/`,
  standardize on the JSON 429 shape, and document it in `.claude/skills/api/SKILL.md`. While
  sweeping the endpoints: add `'Access-Control-Max-Age': '86400'` to `corsHeaders()` (native
  clients currently pay a full OPTIONS round trip on every JSON request); replace
  generate-image's double image copy with `Buffer.from(await imageFile.arrayBuffer()).toString('base64')`
  (`Buffer.from(TypedArray)` copies, `Buffer.from(ArrayBuffer)` wraps — currently an extra
  ≤15 MB allocation per request); and declare `App.Platform` (`context.waitUntil`) in
  `app.d.ts`, dropping generate-image's inline cast. Run `npm run test:api:smoke` after.

- [ ] **[Correctness] Netlify Blobs read-modify-write races lose updates** — File(s): `web/src/lib/server/usage.ts` (44–51), `web/src/lib/server/tokens.ts` (122–128)
  `recordTokenUsage` is a bare `get` → `setJSON`, so two overlapping generations for the same
  token (two devices sharing an invite — exactly the abuse the tally exists to detect) both
  read `N` and both write `N+1`: the counter undercounts precisely under abuse. The installed
  `@netlify/blobs` supports etag CAS — use `getWithMetadata` + `setJSON({ onlyIfMatch })` with
  a couple of retries, still best-effort/never-throwing. Also guard `removeToken` with
  `if (next.length !== list.length)` before `persist` — a no-op remove on a stale replica read
  currently rewrites the whole blob and can clobber a token another admin just added. Add a
  colocated `usage.test.ts` (the only `lib/server` module without one).

- [ ] **[Maint] scripts/ duplicates process glue; `api-smoke` breaks on Windows and both smoke runners orphan the vite grandchild** — File(s): `scripts/api-smoke.mjs`, `scripts/redteam-run.mjs`, `scripts/blobs-smoke.mjs`, `scripts/android-emulator-smoke.mjs`, `scripts/ios-simulator-smoke.mjs`, `scripts/perf/preview.mjs`, `scripts/lib/`
  `api-smoke.mjs` spawns `npx` without a shell — ENOENT on Windows (`npx` is `npx.cmd`),
  violating ADR-0017; the sibling `redteam-run.mjs` already handles it, so the two have
  drifted. Both also `server.kill('SIGTERM')` the npx wrapper, orphaning the vite grandchild —
  the exact port-leak failure `scripts/perf/preview.mjs` documents and solves with a detached
  process group + `taskkill /T`. Meanwhile `sh()`, the smoke-test `check()` reporter, and five
  variants of "poll a URL until up" are duplicated verbatim across the scripts. Extract
  `spawnViteServer(port, env)`, `sh()`, `check()`, and `waitForUrl(url, timeoutMs)` into
  `scripts/lib/` (per `scripts/CLAUDE.md`) and use them everywhere.

- [ ] **[Maint] Lint/format gates skip the E2E specs and web config files; Playwright harness has real drift** — File(s): `package.json` (lint/format globs), `eslint.config.js`, `web/tests/global-setup.ts`, `web/tests/generate-image.spec.ts`, `web/playwright.config.ts`
  (a) `web/tests/**` (8 spec files + global-setup) and `web/*.{ts,js}` configs sit outside both
  the ESLint and Prettier CI gates, so ADR-0031's quality gates don't cover the test layer;
  add them to the `lint`/`format`/`format:check` targets and expect a one-time autofix commit.
  (b) global-setup's dep-optimizer warm-up (browser launch + 3-route warm + 3 s settle streak,
  ~6–8 s per run) only matters under `DEV_SERVER=1`, yet runs on every CI `vite preview` run —
  early-return when `!process.env.DEV_SERVER` and fix the stale comments in `engine.spec.ts` /
  `multitouch.spec.ts`. (c) The generate-image burst spec fills the 60 s limiter window for the
  single allowlisted token, so a CI retry (`retries: 2`) starts inside a still-full window and
  fails deterministically — pick a token by `testInfo.retry` (allowlist several in `test.yml`)
  or wait out `retry-after` before the burst; also drop the redundant 17th request.

- [ ] **[Types] String-union state typed only in comments; untyped props; duplicated `Platform` union** — File(s): `web/src/lib/components/parent/AiKeyManager.svelte` (18, 22, 26), `web/src/lib/components/parent/SetupInstructions.svelte` (9, 11, 21), `web/src/lib/notchBand.ts` (39)
  `let keyStatus = $state('idle'); // 'idle' | 'checking' | 'error' | 'success'` should be
  `$state<'idle' | 'checking' | 'error' | 'success'>('idle')` (same for `platform` and
  `installOs`) — the comment drifts silently and typos in comparisons type-check today. Give
  both components a `Props` interface like the rest of the tree, and `import type { Platform }`
  from `$lib/platform` instead of the hand-copied union in `notchBand.ts` (type-only imports
  are erased, so the file's no-plugin-import purity is preserved). Zero runtime change.

- [ ] **[Polish] Deduplicate repeated UI patterns** — File(s): `web/src/lib/components/admin/AdminConsole.svelte`, `web/src/routes/dev/ai-timer/+page.svelte`, `web/src/lib/components/parent/SettingsToggles.svelte`, `parent/AiKeyManager.svelte`, `parent/AboutTab.svelte`, `web/src/lib/components/ParentCenter.svelte`, `web/src/routes/dev/engine/+page.ts`, `web/src/routes/dev/ai-timer/+page.ts`
  Four small verbatim duplications worth one consolidation sweep: (a) the breadcrumb
  markup + full style block (including the 6-function icon-tint filter) is copy-pasted between
  AdminConsole and the ai-timer harness — extract a `Breadcrumb.svelte`; (b) the
  `.setting-group` rules are repeated across all three Parent Center tabs and the `.setting`
  card style across two (SettingsToggles + AiKeyManager; AboutTab has only `.setting-group`) —
  hoist into ParentCenter's style block with tightly-scoped `:global`, or a small wrapper
  component; (c) ParentCenter's close button has the shared `.modal-close-btn` class but uses
  a bespoke `×` glyph with its own typographic styles instead of the
  `<Icon name="close" class="modal-close-icon">` every other modal wraps, so the shared
  `.modal-close-icon` hover styling silently misses it; (d) both dev routes carry an
  identical `prerender = false` + `PUBLIC_ENABLE_DEV_HARNESS` 404-gate `load` — extract a
  shared `requireDevHarness()` since it's a security-relevant gate with two implementations.

## Sticky `:hover` on touch devices

iOS WebKit (and most touch browsers) apply `:hover` on tap and keep it stuck until
the user taps elsewhere. Any `:hover` rule that changes border/background/box-shadow
leaves the element looking active/highlighted after a tap. The fix is to wrap the
`:hover` rule in `@media (hover: hover)` so it only engages for true pointing devices.
Already fixed in `ActionsPanel.svelte` for `.action-button` and `.stroke-size-button`
(reference implementation). The items below are the remaining unguarded rules.

Priority is by how exposed each is on the native (touch) app: toddler-facing drawing
UI first, then Parent Center (reachable on-device), then web-only admin/dev/static
pages last.

### Toddler-facing drawing UI (highest priority — native touch app)

- [ ] **[Bug] Guard remaining ActionsPanel hover rules** — File(s): `src/lib/components/ActionsPanel.svelte`
  `.drawer-toggle:hover` (and its `:global(.drawer-toggle-icon)` variant) is still
  unguarded — same panel we just partly fixed. Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard ColoringBook hover rules** — File(s): `src/lib/components/ColoringBook.svelte`
  `.coloring-back-button:hover` (+ icon variant) and `.coloring-tile:hover` change
  highlight state; a tapped coloring tile or the back button stays visually
  highlighted after selection. Wrap each in `@media (hover: hover)`.

- [ ] **[Bug] Guard ColorPicker hexagon hover** — File(s): `src/lib/components/ColorPicker.svelte`
  `.hexagon:hover` and `.hexagon:hover::after` highlight the hovered swatch. On touch
  the last-tapped color stays enlarged/highlighted. Note this component also has a
  JS-driven `class:hover={hoveredHex === hex}` path (line ~119) — verify the desired
  active state comes from the class, then guard the CSS `:hover` with `@media (hover: hover)`.

- [ ] **[Bug] Guard AiImagePrompt style-option hover** — File(s): `src/lib/components/AiImagePrompt.svelte`
  `.ai-style-option:hover:not(:disabled) .ai-style-thumb` and `… .ai-style-label`
  leave the last-tapped art-style option looking selected. Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard AiImageResult download hover** — File(s): `src/lib/components/AiImageResult.svelte`
  `.ai-result-download:hover` changes background; sticks after tap on native. Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard modal-close-btn hover** — File(s): `src/app.css`
  `.modal-close-btn:not(:disabled):hover .modal-close-icon` — global rule for the
  modal close button shown across native dialogs. Wrap in `@media (hover: hover)`.

### Parent Center (medium — reachable on-device)

- [ ] **[Bug] Guard ParentCenter hover rules** — File(s): `src/lib/components/ParentCenter.svelte`
  `.parent-help-button:hover` (+ icon variant) and `.parent-help-close:hover`.
  Wrap in `@media (hover: hover)`.

- [ ] **[Bug] Guard parent settings control hovers** — File(s): `src/lib/components/parent/ToggleRow.svelte`, `src/lib/components/parent/SetupInstructions.svelte`, `src/lib/components/parent/AiKeyManager.svelte`, `src/lib/components/parent/AboutTab.svelte`, `src/lib/components/TabPager.svelte`
  ToggleRow `.toggle-switch:hover` / `.toggle-switch.active:hover` / `.toggle-switch:disabled:hover`;
  SetupInstructions `.help-section summary:hover`; AiKeyManager `.access-code-submit:hover`
  and `.access-code-submit.forget:hover`; AboutTab link hovers; TabPager `:global(.tab-button:hover)`.
  Wrap each in `@media (hover: hover)`. (Link/`:disabled` hovers are low-risk but
  worth doing in the same sweep for consistency.)

### Web-only (lowest — desktop/mouse, not in native bundle)

- [ ] **[Polish] Guard admin/dev/static hover rules** — File(s): `src/lib/components/admin/AdminConsole.svelte`, `src/routes/privacy/+page.svelte`, `src/routes/dev/ai-timer/+page.svelte`
  AdminConsole (`a.crumb`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.invite-url`),
  the privacy `.back` link, and the dev ai-timer harness (`a.crumb`, `button`). These
  are web-only desktop surfaces so the sticky-hover bug is unlikely to bite, but
  guarding them keeps the pattern uniform. Low priority / optional.
