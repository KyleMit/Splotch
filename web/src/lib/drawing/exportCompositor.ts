import { containFit } from './paperView';

export type ExportContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface ExportImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

function prepareExportContext(context: ExportContext, scale: number) {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

export function paintExportPaper(
  context: ExportContext,
  {
    width,
    height,
    scale,
    paperColor,
    texture,
  }: {
    width: number;
    height: number;
    scale: number;
    paperColor: string;
    texture: CanvasImageSource | null;
  }
) {
  prepareExportContext(context, scale);
  context.globalCompositeOperation = 'destination-over';
  if (texture) {
    const pattern = context.createPattern(texture, 'repeat');
    if (pattern) {
      context.fillStyle = pattern;
      context.fillRect(0, 0, width, height);
    }
  }
  context.fillStyle = paperColor;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
  context.resetTransform();
}

export function drawExportOverlay(
  context: ExportContext,
  overlay: ExportImage,
  { width, height, scale }: { width: number; height: number; scale: number }
) {
  if (overlay.width === 0 || overlay.height === 0) return;
  const fit = containFit(overlay, { width, height });
  prepareExportContext(context, scale);
  context.globalCompositeOperation = 'source-over';
  context.drawImage(
    overlay.source,
    fit.offsetX,
    fit.offsetY,
    overlay.width * fit.scale,
    overlay.height * fit.scale
  );
  context.resetTransform();
}
