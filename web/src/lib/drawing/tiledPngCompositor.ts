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
