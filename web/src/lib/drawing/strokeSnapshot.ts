import type { TiledExportSnapshot } from './exportDrawing';
import { captureTiledCanvasSnapshot } from './tiledRenderer';

type SnapshotCanvas = HTMLCanvasElement | OffscreenCanvas;

export function captureTiledSnapshot(
  snapshotScale: number,
  renderScale: number
): TiledExportSnapshot | null {
  if (
    snapshotScale !== renderScale ||
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    return null;
  }
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
    target = snapshot.getContext('2d') as unknown as CanvasRenderingContext2D;
  } else {
    snapshot = document.createElement('canvas');
    snapshot.width = width;
    snapshot.height = height;
    target = snapshot.getContext('2d')!;
  }
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.scale(scale, scale);
  render(target);
  return snapshot;
}
