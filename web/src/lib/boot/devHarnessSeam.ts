import { committedBrushMode } from '$lib/drawing/engine';
import { devHarnessEnabled } from '$lib/devHarness';

// Publish the engine's committed brush mode on `window` for the E2E harness
// (ADR-0080): the toolState→engine bridge runs in a $effect, so a spec that
// clicks a brush and draws immediately can commit the stroke under the previous
// brush, and no DOM state distinguishes the two. tests/flows-harness.ts's
// pickBrush() polls this, so the wait is on the engine rather than the button.
//
// Gated on the same PUBLIC_ENABLE_DEV_HARNESS switch as the /dev/* routes, so
// the Netlify deploy never defines it. Installed from the drawing route's
// onMount, whose teardown removes it — the engine itself boots earlier
// (ADR-0072), but no spec can reach a brush button before hydration anyway.
export function installDevHarnessSeam(): () => void {
  if (!devHarnessEnabled()) return () => {};
  window.__committedBrushMode = committedBrushMode;
  return () => {
    delete window.__committedBrushMode;
  };
}
