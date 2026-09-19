import { isAndroidBrowser, isNative } from '$lib/platform';

// Chromium queues a 2D canvas's raster for the GPU process but sends it only
// when something flushes the renderer's GPU channel, which in practice means
// the next frame that presents a changed visible canvas. The history fold
// rasterizes into offscreen base tiles while the page is idle, so its work
// accumulated across every fold of a pause. The GPU then ran all of it before
// the next undo or stroke could present: on an Android phone, a 1.4 s freeze
// after thirty paced crayon scribbles (issue #2072). Canvas 2D has no flush of
// its own. Flushing any WebGL context sends every message queued on the
// channel, so each fold's raster runs while the page is still idle. The flush
// is not a readback and does not wait for the GPU. The context is created
// before the work queues raster, because creating one waits for whatever the
// channel already holds. Measured in Android Chrome only, so the native
// WebView and every other browser keep the unflushed path.
// Evidence: docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush/.
export function createCanvasRasterFlush() {
  let flushContext: WebGLRenderingContext | null | undefined;

  function channelFlushContext() {
    if (flushContext === undefined) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      flushContext = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
    }
    return flushContext && !flushContext.isContextLost() ? flushContext : null;
  }

  return function withCanvasRasterFlush(work: () => void) {
    const flushes = !(__IS_CAPACITOR__ && isNative()) && isAndroidBrowser();
    const context = flushes ? channelFlushContext() : null;
    work();
    if (!context) return;
    // A flush with no new command sends nothing, so it needs one to carry.
    context.clear(context.COLOR_BUFFER_BIT);
    context.flush();
  };
}

export const withCanvasRasterFlush = createCanvasRasterFlush();
