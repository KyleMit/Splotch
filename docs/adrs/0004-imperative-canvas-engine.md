# ADR-0004: Imperative Canvas Engine with Callback Interface

**Status:** Active — amended by ADR-0066 (2026-07): the imperative-engine and callback-bridge
decisions stand unchanged, but the sibling-module list and the undo-memory notes below are
replay-era — snapshot undo re-opens resident-raster memory as a managed, tiered budget. Amended by
ADR-0072 (2026-07): "components mount the engine" becomes "components **adopt** the engine" — init
moved to module-evaluation time, before hydration. See the amendments at the end.\
**Date:** 2024

## Context

The core drawing experience is a multi-touch canvas that tracks pointer events, renders strokes in
real time, maintains an undo stack, and manages a virtual composite canvas for orientation-change
preservation. These concerns involve mutable imperative state (live pointer positions, active
canvases, animation frames) that does not naturally fit Svelte's reactive model — canvas pixels
cannot be expressed as reactive values.

Options considered:

* **Fully reactive Svelte component** — reactive state driving `$effect` to sync canvas.
  Impractical: pointer event frequency (~60fps, multiple simultaneous fingers) would create
  excessive reactive churn; the canvas itself can't be driven by declarative bindings.
* **Web Component / custom element** — isolated but adds bundle overhead and lifecycle complexity.
* **Imperative module with a thin reactive bridge** — the engine lives in `drawing/engine.ts` as a
  plain TypeScript module with module-level mutable state, and Svelte components connect via
  callbacks and direct calls.

## Decision

The drawing engine (`src/lib/drawing/engine.ts`) is a **module-singleton** of mutable imperative
state. Components call `initDrawingCanvas(canvas, options)` on mount, then imperatively call
`setColor()`, `setStrokeWidth()`, `undo()`, `clearCanvas()`, and `exportCanvasBlob()`. The engine
signals state changes back to Svelte via typed callbacks (`onDrawSound`, `onUndoStateChange`,
`onCanvasEmptyChange`). These callbacks are wired into thin `$state` bridging objects in
`state/canvas.svelte.ts`. (The engine has since been split into focused sibling modules —
`undoHistory.ts`, `strokeOps.ts`, `commandSimplify.ts`, `exportDrawing.ts` — that are
module-singletons in the same way; `engine.ts` remains the facade components import, and this
decision is unaffected.)

The virtual canvas (a second off-screen canvas, 2× the viewport dimension) was used as a composite
buffer so that drawing content survives viewport resize and orientation change without loss.
**Superseded by ADR-0034:** the virtual canvas is removed — the ADR-0033 baseline + command log
already retain off-screen content, so resize now rebuilds the visible canvas by replaying them
instead of mirroring every stroke into a second surface.

Undo was originally a stack of up to `MAX_UNDO_STACK_SIZE = 10` full-canvas `HTMLCanvasElement`
snapshots. **Superseded by ADR-0033:** undo is now a log of replayable stroke commands over a single
baseline raster. The imperative-engine and callback-bridge decisions below are unaffected.

`getBoundingClientRect()` is cached in a `canvasRect` variable and refreshed only on
resize/scroll/orientation change — avoiding a forced reflow on every pointer event in the hot path.

**Lifecycle across mounts (2026-07):** being a module singleton, the engine's drawing state (command
log, baseline raster, keyframes, `canUndo`/`canvasEmpty`) intentionally survives component unmount.
The `teardown()` returned by `initDrawingCanvas()` removes event listeners and resets live
pointer-input state only (`releaseAllPointers()` — which also commits a mid-flight stroke into the
log — plus the merged-stream `liveDownIds` tracker, whose self-healing window listeners are gone
after teardown); a later `initDrawingCanvas()` rewires the new canvas and rebuilds the drawing from
the retained baseline + log. Client-side navigation (`/` → `/privacy` → `/`) therefore never
destroys the child's drawing — a parent checking another page must not wipe the kid's work.

## Consequences

* **+** Pointer handling is isolated from Svelte's render cycle; no performance cliff from reactive
  updates on every frame.
* **+** The engine module can be imported and driven from Playwright tests through a dev-harness
  route (`/dev/engine`) without involving any Svelte lifecycle.
* **-** The engine is a module singleton, so the canvas state is global — only one drawing canvas
  can exist at a time in a page.
* **-** Drawing persistence keeps the baseline/keyframe rasters (~30 MB at 2× DPR on a large screen)
  resident while the user sits on a non-drawing route. Accepted: freeing them on unmount would
  either wipe the drawing or add a drop-and-rebuild pipeline for a transient state a toddler-app
  session rarely stays in.
* **-** Callback wiring (`onUndoStateChange`, etc.) is manual; a missed callback means reactive UI
  doesn't update to reflect engine state.
* **-** ~~Undo snapshots consume memory in proportion to canvas size × stack depth (10 frames at
  full viewport resolution).~~ Resolved by ADR-0033: one baseline raster + a small command log.
  *(Re-opened in managed form by ADR-0066 — see the amendment below.)*

## Amendment (ADR-0066, 2026-07)

ADR-0066 replaced command-replay undo (ADR-0033/0035/0036) with snapshot undo: the committed drawing
is again a raster (the "paper"), with a depth-20 stack of pre-stroke snapshots. The core of this ADR
— the imperative module-singleton, the callback bridge, the survive-unmount lifecycle — is
untouched. What changed shape:

* **The sibling-module list:** `commandSimplify.ts` was deleted with the ADR-0036 simplification
  pipeline. The engine's current focused siblings are `undoHistory.ts`, `strokeOps.ts`,
  `strokeMath.ts`, `paperView.ts`, `magicBrush.ts`, `crayonBrush.ts`, `emptyScan.ts`, and
  `exportDrawing.ts` — module-singletons in the same way, with `engine.ts` still the facade.
* **The undo-memory consequence is re-opened, as a managed budget, not the naïve stack.** The
  "resolved by ADR-0033: one baseline raster + a small command log" note no longer describes the
  code: history is again full-canvas snapshots, but tiered — the paper plus the `K_LIVE = 2` most
  recent snapshots stay live rasters (~30 MB each at 2× DPR on a large tablet) and every deeper
  entry is a lossless encoded blob (single-digit MB), so depth 20 costs roughly three live rasters
  plus blob bytes, inside ADR-0066's device-gated ≲ 150 MB budget — not 20 live frames.
* **The lifecycle note's retained state** reads today as: the paper raster, the snapshot stack, and
  any magic-pending commands (plus `canUndo`/`canvasEmpty`) survive teardown; a later
  `initDrawingCanvas()` rebuilds the drawing by blitting the paper (`repaintAll`), not by replaying
  a retained baseline + log. The accepted cost `undoHistory.ts` cites this ADR for — rasters
  resident while no canvas is mounted — now covers that tiered set.

## Amendment (ADR-0072, 2026-07)

"Components call `initDrawingCanvas(canvas, options)` on mount" is superseded: `earlyBoot.ts` now
initializes the engine at module-evaluation time — before SvelteKit hydrates the route — so the
prerendered canvas accepts strokes as soon as the engine chunk evaluates, and
`DrawingCanvas.svelte`'s mount instead **adopts** the running engine via `adoptDrawingCanvas()`
(attach callbacks, replay current state), falling back to a full init when the engine isn't live on
that element (client-side navigation back to `/`, dev HMR). The survive-unmount lifecycle above is
what makes adoption safe and is unchanged; teardown remains full and symmetric. Details, the
interim-window semantics, and the template-owned crayon overlays are in ADR-0072.
