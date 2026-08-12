import {
  createOffscreenCanvas2dSurface,
  type RecoverableCanvas2dSurface,
} from './canvasContextRecovery';
import { drawExportOverlay, paintExportPaper } from './exportCompositor';
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
  const { width, height } = canvas;
  const logicalWidth = width / data.exportScale;
  const logicalHeight = height / data.exportScale;

  paintExportPaper(context, {
    width: logicalWidth,
    height: logicalHeight,
    scale: data.exportScale,
    paperColor: data.paperColor,
    texture: data.texture,
  });

  const tileScale = data.exportScale / data.sourceScale;
  context.setTransform(tileScale, 0, 0, tileScale, 0, 0);
  for (const tile of data.tiles) context.drawImage(tile.bitmap, tile.x, tile.y);
  context.resetTransform();
  if (data.overlay) {
    drawExportOverlay(
      context,
      { source: data.overlay, width: data.overlay.width, height: data.overlay.height },
      { width: logicalWidth, height: logicalHeight, scale: data.exportScale }
    );
  }
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
