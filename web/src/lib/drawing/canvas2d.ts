// A browser returns null here once its canvas memory budget is spent (iOS
// WebKit does this under pressure); failing with a named error beats the
// TypeError the first property write on a null context would throw.
export function require2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');
  return context;
}

// The export replay worker's surfaces raster on the CPU. On Android WebView a GPU-backed worker
// canvas sends its raster and every read-back to the in-process GPU thread, which the WebView's draw
// functor waits on each frame, so the UI thread stalls for the whole export and drops the touch
// samples of a stroke started meanwhile.
export const CPU_SURFACE_SETTINGS: CanvasRenderingContext2DSettings = {
  willReadFrequently: true,
};

// A detached scratch surface for the shared op renderers (crayon tooth tiles, pass buffers, under
// shadows). The export replay worker has no document, so there it is a CPU OffscreenCanvas.
export function createScratch2dContext(width: number, height: number): CanvasRenderingContext2D {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return require2dContext(canvas);
  }
  const context = new OffscreenCanvas(width, height).getContext('2d', CPU_SURFACE_SETTINGS);
  if (!context) throw new Error('2D canvas context unavailable');
  // lib.dom models the offscreen context as unrelated to CanvasRenderingContext2D; the op renderers
  // draw only through the 2D API surface the two share.
  return context as unknown as CanvasRenderingContext2D;
}
