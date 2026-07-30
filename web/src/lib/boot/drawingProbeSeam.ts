import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { getUndoDebug } from '$lib/drawing/engine';

// Read-only observability seam for on-device profiling of the REAL drawing route.
//
// `npm run perf:ipad:frames` measures what `/dev/engine` cannot see — frame
// pacing and input timing on the surface users actually touch — and the one
// thing it could not reach from outside the app was how the undo history is
// currently stored. That matters because the reported lag scales with how much
// has been drawn, and every stroke pushes a dirty-rect patch raster
// (ADR-0069/0074) onto a canvas-backed stack; correlating stall onset against
// `rasterBytes` is how that hypothesis gets tested rather than argued.
//
// `getUndoDebug()` is already an exported test/profiling seam used by
// `/dev/engine` and `perf:undo` — this only exposes the existing one on `/`, and
// only where the dev harness is already unlocked. It exposes no way to CHANGE
// anything: a probe that can mutate the app is a probe that can invalidate its
// own measurement.
//
// Gated by the same signal as `routes/dev/*` (see `lib/devHarness.ts`): the
// Netlify deploy never sets PUBLIC_ENABLE_DEV_HARNESS, so this is inert in
// production. `env` is read from `$env/dynamic/public` so the gate is a runtime
// server decision rather than baked into the bundle, matching the dev routes.
export function exposeDrawingProbeSeam(): () => void {
  if (!dev && env.PUBLIC_ENABLE_DEV_HARNESS !== 'true') return () => {};
  window.__drawingDebug = { getUndoDebug };
  return () => {
    delete window.__drawingDebug;
  };
}
