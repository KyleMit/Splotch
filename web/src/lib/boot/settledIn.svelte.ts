import { untrack } from 'svelte';
import { canvasState, SETTLED_IN_STROKES, type CanvasState } from '$lib/state/canvas.svelte';
import { pwaUpdates } from '$lib/pwa/updates';
import { recordWebInstallRepromptSession } from './webOnlyServices';
import type { BootHiddenOverlays } from './bootHiddenOverlays';

// `canvas` is a test seam: the route always passes the shared instance, and the
// tests build a fresh one so a stroke count past the threshold cannot leak
// between them.
export function installSettledInEffects(
  getHiddenOverlays: () => Pick<BootHiddenOverlays, 'demand'> | null,
  canvas: CanvasState = canvasState
) {
  const settledIn = $derived(canvas.strokeCount >= SETTLED_IN_STROKES);
  // Failure rearms only for a later stroke, never an immediate effect retry loop.
  let retryAfterStroke = $state<number | null>(null);
  const registrationDue = $derived(
    retryAfterStroke === null ? settledIn : canvas.strokeCount > retryAfterStroke
  );

  $effect(() => {
    if (!registrationDue) return;
    // A registration belongs to the document; its reply belongs to this route mount.
    let disposed = false;
    void pwaUpdates.registerDeferredServiceWorker().then((registered) => {
      if (!disposed && !registered) retryAfterStroke = canvas.strokeCount;
    });
    return () => {
      disposed = true;
    };
  });

  $effect(() => {
    if (!settledIn) return;
    const overlays = getHiddenOverlays();
    if (!overlays) return;
    untrack(() => {
      recordWebInstallRepromptSession();
      overlays.demand('installBanner');
    });
  });
}
