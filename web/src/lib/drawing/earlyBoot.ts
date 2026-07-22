import { browser } from '$app/environment';
import { colors } from '$lib/state/colors.svelte';
import { toolState } from '$lib/state/tool.svelte';
import { activeStrokeSize, getStrokeWidthPx } from '$lib/state/strokeWidth.svelte';
import {
  engineOwnsCanvas,
  initDrawingCanvas,
  setCrayonMode,
  setMagicMode,
  setStrokeWidth,
} from './engine';

// Boot the drawing engine at module-evaluation time (ADR-0071): the home route
// is prerendered, so #drawingCanvas is already in the DOM when the deferred
// module scripts run — and module evaluation happens BEFORE SvelteKit's
// hydration pass in the same script execution. Initializing here makes the
// canvas accept strokes as soon as this chunk evaluates instead of after the
// whole route hydrates (the measured ~375 ms hydration long task, several
// seconds of dead canvas on a slow tablet). DrawingCanvas.svelte then ADOPTS
// the running engine on mount (adoptDrawingCanvas), attaching callbacks and
// safe-area insets; until then the engine runs with defaults — no sound, no
// undo-button sync, zero insets — which is the documented interim state.
//
// The initial tool state needs no localStorage duplication: the $state modules
// imported above read their persisted keys (splotch-brush-type,
// splotch-stroke-width-size) synchronously at their own module evaluation, so
// importing them here pulls the child's last brush and stroke width into the
// pre-hydration boot for free. The active color has no persisted key — the
// palette always wakes on its default.
//
// Guarded so a second evaluation adopts instead of double-initializing: the
// engine already owning the canvas means this ran (dev HMR re-evaluates the
// module); a missing canvas means we're not on the drawing route (SvelteKit
// preloading `/` from another page) and the component mount will init instead.
function bootDrawingEngine() {
  const canvas = document.getElementById('drawingCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || engineOwnsCanvas(canvas)) return;
  initDrawingCanvas(canvas, { initialColor: colors.activeColor });
  setStrokeWidth(getStrokeWidthPx(activeStrokeSize()));
  setCrayonMode(toolState.brush === 'crayon');
  setMagicMode(toolState.brush === 'magic');
}

if (browser) bootDrawingEngine();
