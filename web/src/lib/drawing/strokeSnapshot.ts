import type { ExportSnapshot, ReplayExportSnapshot, TiledExportSnapshot } from './exportDrawing';
import { closeReplayCapture } from './exportReplayCapture';
import { captureTiledCanvasSnapshot, captureTiledReplay } from './tiledRenderer';
import { require2dContext } from './canvas2d';

type SnapshotCanvas = HTMLCanvasElement | OffscreenCanvas;

export type StrokeSnapshots = { export: ExportSnapshot; preview: TiledExportSnapshot | null };

function exportWorkersSupported() {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function captureLiveTileSnapshot(renderScale: number): TiledExportSnapshot | null {
  if (!exportWorkersSupported()) return null;
  const source = captureTiledCanvasSnapshot();
  return source ? { source, sourceScale: renderScale } : null;
}

interface ExportSize {
  width: number;
  height: number;
  snapshotScale: number;
  renderScale: number;
}

// At matched scale the export composes the settled live tiles (ADR-0088). Above the live render cap,
// or with a pointer down, it replays the history at export scale in the replay worker, whose CPU
// surfaces keep that full-page raster off the page's GPU thread. Null without the export workers.
export function captureWorkerSnapshots(
  { width, height, snapshotScale, renderScale }: ExportSize,
  capturePreview: boolean
): StrokeSnapshots | null {
  if (!exportWorkersSupported()) return null;
  if (snapshotScale === renderScale) {
    const tiled = captureLiveTileSnapshot(renderScale);
    if (tiled) return { export: tiled, preview: null };
  }
  const replay: ReplayExportSnapshot = {
    replay: captureTiledReplay(),
    width,
    height,
    replayScale: snapshotScale / renderScale,
  };
  return { export: replay, preview: capturePreview ? captureLiveTileSnapshot(renderScale) : null };
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

export function closeTiledExportSnapshot(snapshot: TiledExportSnapshot | null) {
  if (!snapshot) return;
  for (const { bitmap } of snapshot.source.tiles) {
    void bitmap.then(
      (resolved) => resolved.close(),
      () => undefined
    );
  }
}

export function closeStrokeSnapshots(snapshots: StrokeSnapshots) {
  if ('source' in snapshots.export) closeTiledExportSnapshot(snapshots.export);
  if ('replay' in snapshots.export) closeReplayCapture(snapshots.export.replay);
  closeTiledExportSnapshot(snapshots.preview);
}
