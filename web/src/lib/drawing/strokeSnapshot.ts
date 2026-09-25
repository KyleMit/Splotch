import type { TiledExportSnapshot } from './exportDrawing';
import { captureTiledCanvasSnapshot } from './tiledRenderer';
import { require2dContext } from './canvas2d';

type SnapshotCanvas = HTMLCanvasElement | OffscreenCanvas;

export function captureTiledSnapshot(
  snapshotScale: number,
  renderScale: number
): TiledExportSnapshot | null {
  if (snapshotScale !== renderScale) return null;
  return captureLiveTileSnapshot(renderScale);
}

export function captureLiveTileSnapshot(renderScale: number): TiledExportSnapshot | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  const source = captureTiledCanvasSnapshot();
  return source ? { source, sourceScale: renderScale } : null;
}

export function createStrokeSnapshot(
  width: number,
  height: number,
  scale: number,
  render: (target: CanvasRenderingContext2D) => void
): SnapshotCanvas {
  let snapshot: SnapshotCanvas;
  let target: CanvasRenderingContext2D;
  if (typeof OffscreenCanvas !== 'undefined') {
    snapshot = new OffscreenCanvas(width, height);
    const offscreenTarget = snapshot.getContext('2d');
    if (!offscreenTarget) throw new Error('2D canvas context unavailable');
    // lib.dom models the offscreen context as unrelated to CanvasRenderingContext2D;
    // the render callback draws only through the 2D API surface the two share.
    target = offscreenTarget as unknown as CanvasRenderingContext2D;
  } else {
    snapshot = document.createElement('canvas');
    snapshot.width = width;
    snapshot.height = height;
    target = require2dContext(snapshot);
  }
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.scale(scale, scale);
  render(target);
  return snapshot;
}
