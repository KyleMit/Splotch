# ADR-0004: Imperative Canvas Engine with Callback Interface

**Status:** Active  
**Date:** 2024

## Context

The core drawing experience is a multi-touch canvas that tracks pointer events, renders strokes in real time, maintains an undo stack, and manages a virtual composite canvas for orientation-change preservation. These concerns involve mutable imperative state (live pointer positions, active canvases, animation frames) that does not naturally fit Svelte's reactive model — canvas pixels cannot be expressed as reactive values.

Options considered:
- **Fully reactive Svelte component** — reactive state driving `$effect` to sync canvas. Impractical: pointer event frequency (~60fps, multiple simultaneous fingers) would create excessive reactive churn; the canvas itself can't be driven by declarative bindings.
- **Web Component / custom element** — isolated but adds bundle overhead and lifecycle complexity.
- **Imperative module with a thin reactive bridge** — the engine lives in `drawing/engine.ts` as a plain TypeScript module with module-level mutable state, and Svelte components connect via callbacks and direct calls.

## Decision

The drawing engine (`src/lib/drawing/engine.ts`) is a **module-singleton** of mutable imperative state. Components call `initDrawingCanvas(canvas, options)` on mount, then imperatively call `setColor()`, `setStrokeWidth()`, `undo()`, `clearCanvas()`, and `exportCanvas()`. The engine signals state changes back to Svelte via typed callbacks (`onDrawSound`, `onUndoStateChange`, `onCanvasEmptyChange`). These callbacks are wired into thin `$state` bridging objects in `state/canvas.svelte.ts`.

The virtual canvas (a second off-screen canvas, 2× the viewport dimension) is used as a composite buffer so that drawing content survives viewport resize and orientation change without loss.

Undo snapshots are stored as `HTMLCanvasElement` objects (not image data arrays), capped at `MAX_UNDO_STACK_SIZE = 10`. The canvas approach avoids a `getImageData` / `putImageData` round-trip on every undo step.

`getBoundingClientRect()` is cached in a `canvasRect` variable and refreshed only on resize/scroll/orientation change — avoiding a forced reflow on every pointer event in the hot path.

## Consequences

- **+** Pointer handling is isolated from Svelte's render cycle; no performance cliff from reactive updates on every frame.
- **+** The engine module can be imported and driven from Playwright tests through a dev-harness route (`/dev/engine`) without involving any Svelte lifecycle.
- **-** The engine is a module singleton, so the canvas state is global — only one drawing canvas can exist at a time in a page.
- **-** Callback wiring (`onUndoStateChange`, etc.) is manual; a missed callback means reactive UI doesn't update to reflect engine state.
- **-** Undo snapshots consume memory in proportion to canvas size × stack depth (10 frames at full viewport resolution).
