import { drawExportOverlay, paintExportPaper } from './exportCompositor';
import type { TiledPngInput } from './pngEncoderProtocol';

export async function encodeTiledPng(data: TiledPngInput): Promise<Blob> {
  const width = Math.round((data.sourceWidth / data.sourceScale) * data.exportScale);
  const height = Math.round((data.sourceHeight / data.sourceScale) * data.exportScale);
  const logicalWidth = width / data.exportScale;
  const logicalHeight = height / data.exportScale;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG encoder could not allocate a 2D context');

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
  return canvas.convertToBlob({ type: 'image/png' });
}
