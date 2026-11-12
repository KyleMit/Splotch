import { CPU_SURFACE_SETTINGS } from './canvas2d';
import {
  createOffscreenCanvas2dSurface,
  type RecoverableCanvas2dSurface,
} from './canvasContextRecovery';
import { paintTiledExportLayers } from './exportCompositor';
import type { TiledPngInput } from './pngEncoderProtocol';

// The export rasters on the worker's CPU (CPU_SURFACE_SETTINGS says why); the GPU thread keeps one
// read-back per live tile.
export function createTiledPngSurface(data: TiledPngInput): RecoverableCanvas2dSurface {
  const width = Math.round((data.sourceWidth / data.sourceScale) * data.exportScale);
  const height = Math.round((data.sourceHeight / data.sourceScale) * data.exportScale);
  return createOffscreenCanvas2dSurface(
    width,
    height,
    'PNG encoder could not allocate a 2D context',
    CPU_SURFACE_SETTINGS
  );
}

// The layers both the preview and the page paint. A tile is a transferred bitmap or, once read back,
// a CPU surface.
export interface TiledLayers extends Omit<TiledPngInput, 'exportScale' | 'previewWidth' | 'tiles'> {
  tiles: ReadonlyArray<{ bitmap: CanvasImageSource; x: number; y: number }>;
}

// Drawing a GPU-backed bitmap onto a CPU surface reads it back each time, so when the preview and
// the page both need the tiles, each is read back once onto a CPU surface they then share.
export function readTilesOnce(
  tiles: TiledPngInput['tiles']
): Array<{ bitmap: CanvasImageSource; x: number; y: number }> {
  return tiles.map(({ bitmap, x, y }) => {
    const copy = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = copy.getContext('2d', CPU_SURFACE_SETTINGS);
    if (!context) return { bitmap, x, y };
    context.drawImage(bitmap, 0, 0);
    return { bitmap: copy, x, y };
  });
}

function paintTiledLayersAt(
  context: OffscreenCanvasRenderingContext2D,
  data: TiledLayers,
  scale: number
) {
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
}

export function paintTiledPngSurface(
  { context }: RecoverableCanvas2dSurface,
  data: TiledLayers & Pick<TiledPngInput, 'exportScale'>
) {
  paintTiledLayersAt(context, data, data.exportScale);
}

// The polaroid preview is painted from the same layers at its own size before the full page, so the
// full page's CPU compose never delays the picture the child sees.
export function createTiledPngPreview(data: TiledLayers, previewWidth: number): ImageBitmap {
  const scale = previewWidth / (data.sourceWidth / data.sourceScale);
  const previewHeight = Math.max(1, Math.round((data.sourceHeight / data.sourceScale) * scale));
  const preview = new OffscreenCanvas(previewWidth, previewHeight);
  const context = preview.getContext('2d', CPU_SURFACE_SETTINGS);
  if (!context) throw new Error('PNG encoder could not allocate a preview context');
  paintTiledLayersAt(context, data, scale);
  return preview.transferToImageBitmap();
}
