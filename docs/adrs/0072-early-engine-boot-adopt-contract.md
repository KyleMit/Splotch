# ADR-0072: Early Engine Boot at Module Evaluation — Components Adopt the Running Engine

**Status:** Active — amends [ADR-0004](0004-imperative-canvas-engine.md): "components mount the
engine" becomes "components adopt the engine". **Date:** 2026-07

## Context

`DrawingCanvas.svelte`'s `onMount` used to call `initDrawingCanvas()`, and `onMount` only fires
after SvelteKit finishes hydrating the whole route — palette, actions panel, everything. Measured
with `npm run perf:mount` (phone viewport, 4× CPU throttle, Slow-4G): first contentful paint at ~644
ms, but the canvas stayed inert until a single ~375 ms uninterruptible hydration task ended ~1.7 s
in, when the pointer listeners finally attached. On a real budget tablet with real network
round-trips that is the reported 3–4 s dead-canvas window: the prerendered shell *looks* ready
seconds before it *is*, inviting a toddler to scribble on a dead screen and lose the strokes.

Nothing actually requires the wait: the engine is deliberately framework-free (ADR-0004), the home
route is prerendered (ADR-0040) so `#drawingCanvas` is in the static HTML before any deferred module
script runs, and the drawing history is module-level state that already survives component teardown
(ADR-0066) — which is exactly what makes a component-independent engine lifecycle safe.

Alternatives considered:

* **SvelteKit partial/prioritized hydration** — doesn't exist (sveltejs/kit issue 1390); a
  hand-rolled early init of the one imperative subsystem is the idiomatic escape hatch.
* **Shrinking the hydration task further** — the boot-hidden overlays are already idle-mounted
  (ADR-0049); the floor is still "hydrate the whole route before `onMount`", so no amount of
  trimming removes the wait from the drawable path.
* **A pre-hydration stroke buffer** (record raw input before the engine chunk arrives, replay at
  init) — considered and deliberately deferred: after this change the residual gap is only the
  engine chunk's download + parse, and the buffer is only worth its complexity if that residual
  window still matters on real hardware.

## Decision

**The engine starts at module-evaluation time; components adopt it.**

* **`lib/drawing/earlyBoot.ts`** (new) initializes the engine as a browser-guarded module side
  effect: it grabs the prerendered `#drawingCanvas` via `getElementById` and calls
  `initDrawingCanvas()` — module evaluation runs after download/parse but *before* the hydration
  pass in the same script execution, so the canvas accepts strokes the moment the chunk evaluates.
  `web/src/routes/+page.svelte` imports it for side effect, **deliberately static** so it stays in
  the page's modulepreloaded graph (a dynamic import would land after hydration — the exact wait
  this removes). Initial tool state needs no duplicated `localStorage` reads: the imported `$state`
  modules (`tool.svelte.ts`, `strokeWidth.svelte.ts`) read their persisted keys synchronously at
  their own module evaluation, so early boot gets the child's last brush and stroke width for free
  (the active color has no persisted key and wakes on its default).
* **`engine.ts` splits init from callback attachment.** `initDrawingCanvas()` still does the full
  wire-up (and now tears down a previous live instance first, so a re-init can never double up
  window listeners); `adoptDrawingCanvas()` is what components call on mount: when the engine is
  already live **on that exact element** it only attaches the callbacks and replays the current
  state (`canUndo`, `canvasEmpty`, the paper view) to the new subscriber — strokes may have landed
  before hydration. When it isn't (client-side navigation back to `/` remounts a fresh canvas; dev
  HMR; a hydration fallback replacing the element), adopt falls back to a full init, which rebuilds
  the drawing from the module-level history (ADR-0066). Teardown stays symmetric: unmount runs the
  full engine teardown (listeners, pointer state, callback detach), and the next mount adopts or
  re-inits.
* **The crayon overlay canvases are template-owned, not engine-injected.** The engine used to create
  and insert its two live-pass overlay canvases at init. Done before hydration, that corrupts the
  DOM Svelte expects: hydration bails with `hydration_mismatch` and silently re-renders the whole
  route client-side, replacing the live canvas (verified — the failure mode of the naive version of
  this change). `DrawingCanvas.svelte` now renders the pair (`canvas[data-crayon-overlay]`, styled
  by its scoped CSS) so the prerendered DOM already matches, and the engine *adopts* them; it
  creates and inline-styles its own only where the markup has none (the `/dev/engine` harness, which
  inits after hydration where injection is safe).
* **The interim window is explicit and accepted.** Between engine-live and hydration-complete the
  engine runs on defaults: no draw sound, no undo-button/empty-state sync (replayed at adopt), no
  stroke-count ticks (pre-hydration strokes don't count toward the install-banner threshold), zero
  safe-area insets (the tablet long-bottom-edge extra guard is inactive; the orientation-driven edge
  guards work regardless), and no coloring-page sheet (not persisted — a persisted magic brush
  reveals the rainbow, its blank-canvas behavior). All of these are the engine's existing defaults;
  nothing new is synthesized for the window.

Non-obvious invariants:

* **Nothing may inject DOM into the prerendered subtree before hydration** — that's the
  hydration-bail hazard above, and it fails *silently* (adopt's fallback re-init masks it as
  correct-but-slow). The overlay adoption seam exists purely to respect this.
* The `earlyBoot` import in `+page.svelte` must stay a static, side-effect import; the engine chunk
  must stay in the prerendered page's modulepreload graph while the save modules stay out
  (`web/tests/startup-bundle.spec.ts`, issue 461).
* `.crayon-overlay` in `DrawingCanvas.svelte` and the engine's `overlayCss` string are the same
  styling in two places — keep them in sync.

## Consequences

* \+ The canvas accepts strokes at engine-chunk evaluation instead of hydration end — the whole
  hydration wait (the ~375 ms throttled long task; seconds on a slow tablet) leaves the drawable
  path, and a toddler's first eager scribble lands in the drawing.
* \+ No framework fork: hydration itself is untouched (Svelte still claims the same canvas), and the
  adopt fallback means every remount path degrades to exactly the old mount-time init.
* \+ The engine's component-independence (ADR-0004/0066) is now load-bearing in both directions:
  state survives unmount *and* predates mount.
* − Pre-hydration strokes are silent, un-counted (`strokeCount`), and un-reflected in the not-yet-
  interactive UI until adopt replays state; the tablet-landscape bottom-edge inset guard is off for
  the same window. Accepted: seconds at most, and strictly better than a dead canvas.
* − Boot state is split across `earlyBoot.ts` (pre-hydration) and `DrawingCanvas.svelte`'s
  mount/`$effect` bridges (post-hydration); a new engine-facing setting must decide whether the
  interim window needs it (add to earlyBoot) or not (bridges only).
* − The engine has a real lifecycle now (`engineLive`, owns-canvas checks, created-vs-adopted
  overlays) where "init on mount, teardown on unmount" used to be the whole story.
* − The hydration-bail hazard is one innocent-looking pre-hydration DOM write away, and its symptom
  (silent client re-render + fallback re-init) looks like working code.
  `web/tests/early-boot.spec.ts` pins it: the post-hydration canvas must be the pre-hydration
  element, the console must carry no hydration output, and the canvas stack must hold exactly the
  prerendered trio.

Amends **ADR-0004** (the mount contract; see its amendment note). Leans on **ADR-0066** (module-
level history makes adoption safe), **ADR-0040** (the prerendered home shell the boot targets), and
**ADR-0049** (idle-mounted overlays — the complementary "after hydration" half of startup).
