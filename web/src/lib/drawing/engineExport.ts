import type { ExportOptions, ExportSnapshot } from './exportDrawing';
import { currentExportScale } from './exportScale';
import { captureTiledSnapshot, createStrokeSnapshot } from './strokeSnapshot';

export type { ExportOptions };

interface EngineExportSource {
  paperWidth: number;
  paperHeight: number;
  renderScale: number;
  renderStrokes: (target: CanvasRenderingContext2D) => void;
}

function snapshotStrokes(source: EngineExportSource, snapshotScale: number): ExportSnapshot {
  const width = Math.round((source.paperWidth / source.renderScale) * snapshotScale);
  const height = Math.round((source.paperHeight / source.renderScale) * snapshotScale);
  const tiledSnapshot = captureTiledSnapshot(snapshotScale, source.renderScale);
  return (
    tiledSnapshot ??
    createStrokeSnapshot(width, height, snapshotScale / source.renderScale, source.renderStrokes)
  );
}

export async function exportEngineCanvas(
  source: EngineExportSource,
  overlayImage: HTMLImageElement | null,
  options: ExportOptions
): Promise<Blob | null> {
  const scale = currentExportScale();
  const snapshot = snapshotStrokes(source, scale);
  const { composeExportPng } = await import('./exportDrawing');
  return composeExportPng(snapshot, scale, overlayImage, options);
}
