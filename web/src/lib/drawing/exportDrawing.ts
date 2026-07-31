// Composes the shareable PNG of the current drawing: the theme's paper color,
// the handmade-paper texture, the strokes (snapshotted by the engine), and the
// coloring-page overlay on top — the same stack the child sees on screen. The
// overlay is generated as transparent black or white ink for its theme, so the
// export uses ordinary source-over composition.
//
// Save-time-only, so the engine loads this module on demand (issue #461) —
// keep it free of static importers or it silently merges back into the startup
// bundle (web/tests/startup-bundle.spec.ts guards the modulepreload list). The
// stroke snapshot is taken synchronously by engineExport BEFORE the
// module load's await, so a clear racing the export can't blank it.

import { PAPER_COLORS, type ResolvedTheme } from '../theme';
import { resolvedTheme } from '../state/appearance.svelte';
import { containFit } from './paperView';
import { encodeCanvasPng, encodeTiledCanvasPng } from './pngEncoder';
import type { TiledCanvasSnapshot } from './tiledRenderer';

type ExportCanvas = HTMLCanvasElement | OffscreenCanvas;
type ExportContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface TiledExportSnapshot {
  source: TiledCanvasSnapshot;
  sourceScale: number;
}
export type ExportSnapshot = ExportCanvas | TiledExportSnapshot;

export interface ExportOptions {
  includePaperTexture?: boolean;
}

function getExportContext(canvas: ExportCanvas): ExportContext | null {
  return canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : canvas.getContext('2d');
}

let paperTextureImage: HTMLImageElement | null = null;
let paperTexturePromise: Promise<HTMLImageElement | null> | null = null;

function loadPaperTexture(): Promise<HTMLImageElement | null> {
  if (paperTextureImage) return Promise.resolve(paperTextureImage);
  if (paperTexturePromise) return paperTexturePromise;
  paperTexturePromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      paperTextureImage = img;
      resolve(img);
    };
    img.onerror = () => {
      paperTexturePromise = null;
      resolve(null);
    };
    img.src = '/icons/handmade-paper.webp';
  });
  return paperTexturePromise;
}

// Warm the paper texture so the fetch + decode (~226ms) doesn't stall the
// first export. The engine calls this from its own idle warm of this module.
export function warmPaperTexture() {
  void loadPaperTexture();
}

async function paintPaperBackground(
  target: ExportContext,
  w: number,
  h: number,
  includePaperTexture: boolean,
  theme: ResolvedTheme
) {
  target.globalCompositeOperation = 'destination-over';
  if (includePaperTexture) {
    const texture = await loadPaperTexture();
    const pattern = texture ? target.createPattern(texture, 'repeat') : null;
    if (pattern) {
      target.fillStyle = pattern;
      target.fillRect(0, 0, w, h);
    }
  }
  target.fillStyle = PAPER_COLORS[theme];
  target.fillRect(0, 0, w, h);
  target.globalCompositeOperation = 'source-over';
}

// The coloring page blends over the finished composite, contain-fit and
// centered — matching how the transparent overlay <img> renders above the canvas.
function drawOverlayContained(
  target: ExportContext,
  overlay: HTMLImageElement,
  w: number,
  h: number
) {
  if (overlay.naturalWidth === 0 || overlay.naturalHeight === 0) return;
  const { scale, offsetX, offsetY } = containFit(
    { width: overlay.naturalWidth, height: overlay.naturalHeight },
    { width: w, height: h }
  );
  const drawnW = overlay.naturalWidth * scale;
  const drawnH = overlay.naturalHeight * scale;
  target.globalCompositeOperation = 'source-over';
  target.drawImage(overlay, offsetX, offsetY, drawnW, drawnH);
  target.globalCompositeOperation = 'source-over';
}

export async function composeExportPng(
  snapshot: ExportSnapshot,
  renderScale: number,
  overlayImage: HTMLImageElement | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  const { includePaperTexture = true } = options;

  // Resolve once up front so an OS theme switch mid-export can't mismatch the
  // paper fill and the overlay treatment. Coloring pages follow the resolved
  // theme just like free-draw (ADR-0052 direction B): a dark-mode save is the
  // night version — dark paper, the generated transparent white chalk overlay,
  // and the night-fill reveals already baked into the replayed strokes.
  const theme = resolvedTheme();

  if ('source' in snapshot) {
    const texture = includePaperTexture ? await loadPaperTexture() : null;
    const [tiles, textureBitmap, overlayBitmap] = await Promise.all([
      Promise.all(
        snapshot.source.tiles.map(async (tile) => ({
          bitmap: await tile.bitmap,
          x: tile.x,
          y: tile.y,
        }))
      ),
      texture ? createImageBitmap(texture) : null,
      overlayImage?.naturalWidth ? createImageBitmap(overlayImage) : null,
    ]);
    return encodeTiledCanvasPng({
      sourceWidth: snapshot.source.width,
      sourceHeight: snapshot.source.height,
      sourceScale: snapshot.sourceScale,
      exportScale: renderScale,
      tiles,
      texture: textureBitmap,
      overlay: overlayBitmap,
      paperColor: PAPER_COLORS[theme],
    });
  }

  const w = snapshot.width / renderScale;
  const h = snapshot.height / renderScale;

  const target = getExportContext(snapshot);
  if (!target) return null;
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = 'high';
  target.setTransform(renderScale, 0, 0, renderScale, 0, 0);

  await paintPaperBackground(target, w, h, includePaperTexture, theme);
  if (overlayImage) drawOverlayContained(target, overlayImage, w, h);

  return encodeCanvasPng(snapshot);
}
