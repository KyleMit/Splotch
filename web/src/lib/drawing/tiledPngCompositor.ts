import { CPU_SURFACE_SETTINGS } from './canvas2d';
import {
  createOffscreenCanvas2dSurface,
  type RecoverableCanvas2dSurface,
} from './canvasContextRecovery';
import { paintTiledExportLayers } from './exportCompositor';
import type { TiledPngInput } from './pngEncoderProtocol';

export function createTiledPngSurface(data: TiledPngInput): RecoverableCanvas2dSurface {
  const width = Math.round((data.sourceWidth / data.sourceScale) * data.exportScale);
  const height = Math.round((data.sourceHeight / data.sourceScale) * data.exportScale);
  return createOffscreenCanvas2dSurface(
    width,
    height,
    'PNG encoder could not allocate a 2D context'
  );
}

export function paintTiledPngSurface(
  { canvas, context }: RecoverableCanvas2dSurface,
  data: TiledPngInput
) {
  paintTiledExportLayers(context, {
    tiles: data.tiles,
    sourceScale: data.sourceScale,
    width: canvas.width / data.exportScale,
    height: canvas.height / data.exportScale,
    scale: data.exportScale,
    paperColor: data.paperColor,
    texture: data.texture,
    overlay: data.overlay
      ? { source: data.overlay, width: data.overlay.width, height: data.overlay.height }
      : null,
  });
}

export function createTiledPngPreview(canvas: OffscreenCanvas, previewWidth: number): ImageBitmap {
  const previewHeight = Math.max(1, Math.round((canvas.height / canvas.width) * previewWidth));
  const preview = new OffscreenCanvas(previewWidth, previewHeight);
  const context = preview.getContext('2d');
  if (!context) throw new Error('PNG encoder could not allocate a preview context');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, previewWidth, previewHeight);
  return preview.transferToImageBitmap();
}

// The live-tile layers the replay worker paints its polaroid from.
export type TiledLayers = Omit<TiledPngInput, 'exportScale' | 'previewWidth'>;

// The replay worker's polaroid: the settled live tiles painted at the preview's own size, on a CPU
// surface, before the replay starts, so the full page's replay never delays the picture the child
// sees. The matched-scale path above keeps the downscale of its composed page that ADR-0088
// measured on the iPad.
export function createLayeredPngPreview(data: TiledLayers, previewWidth: number): ImageBitmap {
  const scale = previewWidth / (data.sourceWidth / data.sourceScale);
  const previewHeight = Math.max(1, Math.round((data.sourceHeight / data.sourceScale) * scale));
  const preview = new OffscreenCanvas(previewWidth, previewHeight);
  const context = preview.getContext('2d', CPU_SURFACE_SETTINGS);
  if (!context) throw new Error('PNG encoder could not allocate a preview context');
  paintTiledExportLayers(context, {
    tiles: data.tiles,
    sourceScale: data.sourceScale,
    width: data.sourceWidth / data.sourceScale,
    height: data.sourceHeight / data.sourceScale,
    scale,
    paperColor: data.paperColor,
    texture: data.texture,
    overlay: data.overlay
      ? { source: data.overlay, width: data.overlay.width, height: data.overlay.height }
      : null,
  });
  return preview.transferToImageBitmap();
}
