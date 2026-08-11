import { dev } from '$app/environment';
import {
  committedBrushMode,
  getDrawingWorkDebug,
  getLiveSurfaceTopology,
  getUndoDebug,
} from '$lib/drawing/engine';
import { generateAiImage } from '$lib/drawing/aiImage';
import { PERF_MARKS } from '$lib/drawing/perf';

// The drawing route's gated `window` seams — what the E2E harness and the
// on-device profiler need to see and no DOM state exposes. One module rather than
// one per consumer, so there is a single place to read what this route publishes
// and a single teardown.
//
// PUBLIC_ENABLE_DEV_HARNESS is compiled into a literal for this client-only
// surface; PERF_MARKS builds retain it independently. Normal web and native
// builds therefore drop the assignments and property names, while /dev/*
// server routes keep their separate runtime gate. Installed from the drawing
// route's onMount, whose teardown removes them — the engine itself boots
// earlier (ADR-0072), but no spec can reach a brush button before hydration.
//
// State-inspection seams are READ-ONLY on purpose. A seam that sets internal
// state invites specs that pass against a configuration no child ever reaches,
// and a profiling seam that mutates can invalidate its own measurement.
// __aiGenerate is the distinct allowed shape: an invoke handle for a production
// function with its production arguments, not a setter for otherwise-unreachable
// state (ADR-0109).
//
//   __committedBrushMode (ADR-0080) — the engine's committed brush mode. The
//     toolState→engine bridge runs in a $effect, so a spec that clicks a brush
//     and draws immediately can commit the stroke under the previous brush, and
//     no DOM state distinguishes the two. tests/flows-harness.ts's pickBrush()
//     polls this, so the wait is on the engine rather than the button.
//   __drawingDebug (ADR-0083/0085) — how the undo history is stored and the
//     configured live-surface dimensions, for on-device profiling. Idle hidden
//     canvases can release their backing stores to the browser's 300×150
//     default, so DOM inspection cannot establish the surface-flush budget.
//     `/dev/engine` already exposed `getUndoDebug()`; this reaches the same
//     engine state on the route users actually draw on.
//   __aiGenerate (ADR-0109) — invokes the production AI-generation flow so
//     Playwright can mock its existing HTTP boundary while covering canvas
//     export, upload encoding, response parsing, and state application.
export function installDevHarnessSeam(): () => void {
  if (!dev && !__DEV_HARNESS__ && !PERF_MARKS) return () => {};
  window.__committedBrushMode = committedBrushMode;
  window.__drawingDebug = { getDrawingWorkDebug, getLiveSurfaceTopology, getUndoDebug };
  window.__aiGenerate = generateAiImage;
  return () => {
    delete window.__committedBrushMode;
    delete window.__drawingDebug;
    delete window.__aiGenerate;
  };
}
