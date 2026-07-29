// Blank-canvas detection. Emptiness is scanned on a small CPU-side scratch
// canvas instead of the main canvas: reading the (GPU-backed) main canvas
// directly would either force a slow readback or require willReadFrequently,
// which de-accelerates every stroke. Downscaling shrinks the pixel loop ~16×
// and the drawImage stays GPU→GPU until the tiny scratch readback. The scratch
// canvas is a singleton cache that deliberately outlives engine teardown and
// remounts, so a remount never pays for a re-allocation.

import { PERF_MARKS } from './perf';

const EMPTY_SCAN_SCALE = 0.25;
// Downscale rounding can smear residue to near-zero alpha; anything below this
// counts as empty.
export const EMPTY_SCAN_ALPHA_THRESHOLD = 4;

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

export function alphaDataHasInk(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= EMPTY_SCAN_ALPHA_THRESHOLD) return true;
  }
  return false;
}

export function scanCanvasIsEmpty(source: HTMLCanvasElement, renderScale: number): boolean {
  if (source.width === 0 || source.height === 0) return true;
  if (PERF_MARKS) performance.mark('engine.scanEmpty:start');
  try {
    if (!scratchCanvas) {
      scratchCanvas = document.createElement('canvas');
      scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!scratchCtx) return true;
    // Scan relative to CSS pixels so the readback loop stays the same size
    // regardless of renderScale.
    const w = Math.max(1, Math.ceil((source.width * EMPTY_SCAN_SCALE) / renderScale));
    const h = Math.max(1, Math.ceil((source.height * EMPTY_SCAN_SCALE) / renderScale));
    if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
      scratchCanvas.width = w;
      scratchCanvas.height = h;
    } else {
      scratchCtx.clearRect(0, 0, w, h);
    }
    scratchCtx.drawImage(source, 0, 0, w, h);
    const { data } = scratchCtx.getImageData(0, 0, w, h);
    return !alphaDataHasInk(data);
  } finally {
    if (PERF_MARKS) {
      performance.mark('engine.scanEmpty:end');
      performance.measure('engine.scanEmpty', 'engine.scanEmpty:start', 'engine.scanEmpty:end');
    }
  }
}
