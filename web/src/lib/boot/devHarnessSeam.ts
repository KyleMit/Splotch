import { committedBrushMode, getUndoDebug } from '$lib/drawing/engine';
import { devHarnessEnabled } from '$lib/devHarness';

// The drawing route's gated `window` seams — what the E2E harness and the
// on-device profiler need to see and no DOM state exposes. One module rather than
// one per consumer, so there is a single place to read what this route publishes
// and a single teardown.
//
// Gated on the same PUBLIC_ENABLE_DEV_HARNESS switch as the /dev/* routes
// (`devHarnessEnabled()` is its single definition), so the Netlify deploy never
// defines any of it. Installed from the drawing route's onMount, whose teardown
// removes them — the engine itself boots earlier (ADR-0072), but no spec can
// reach a brush button before hydration anyway.
//
// Both are READ-ONLY on purpose. A test seam that mutates invites specs that pass
// against a configuration no child ever runs; a profiling seam that mutates can
// invalidate its own measurement.
//
//   __committedBrushMode (ADR-0080) — the engine's committed brush mode. The
//     toolState→engine bridge runs in a $effect, so a spec that clicks a brush
//     and draws immediately can commit the stroke under the previous brush, and
//     no DOM state distinguishes the two. tests/flows-harness.ts's pickBrush()
//     polls this, so the wait is on the engine rather than the button.
//   __drawingDebug (ADR-0083) — how the undo history is currently stored, for
//     `npm run perf:ipad:frames`. The reported real-screen lag scales with how
//     much has been drawn, and every stroke pushes a canvas-backed dirty-rect
//     patch (ADR-0069/0074), so correlating stall onset against `rasterBytes` is
//     how that gets tested rather than argued. `/dev/engine` already exposed
//     `getUndoDebug()`; this reaches it on the route users actually draw on.
export function installDevHarnessSeam(): () => void {
  if (!devHarnessEnabled()) return () => {};
  window.__committedBrushMode = committedBrushMode;
  window.__drawingDebug = { getUndoDebug };
  return () => {
    delete window.__committedBrushMode;
    delete window.__drawingDebug;
  };
}
