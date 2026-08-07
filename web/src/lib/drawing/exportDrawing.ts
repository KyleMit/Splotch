// Composes the shareable PNG of the current drawing: the theme's paper color,
// the handmade-paper texture, the strokes (snapshotted by the engine), and the
// coloring-page overlay on top — the same stack the child sees on screen. The
// overlay is generated as transparent black or white ink for its theme, so the
// export uses ordinary source-over composition.
//
// Save-time-only, so the engine loads this module on demand (issue #461) —
// keep it free of static importers or it silently merges back into the startup
// bundle (web/tests/startup-bundle.spec.ts guards the modulepreload list). The
// stroke snapshot is taken synchronously by engine.exportCanvasBlob BEFORE
// the module load's await, so a clear racing the export can't blank it.

import { PAPER_COLORS, type ResolvedTheme } from '../theme';
import { PAPER_TEXTURES } from '../design/tokens';
import { resolvedTheme } from '../state/appearance.svelte';
import { drawExportOverlay, paintExportPaper, type ExportContext } from './exportCompositor';
import type { ExportOverlaySource } from './overlay';
import { encodeCanvasPng, encodeTiledCanvasPng } from './pngEncoder';
import type { TiledCanvasSnapshot } from './tiledSurfaces';

type ExportCanvas = HTMLCanvasElement | OffscreenCanvas;
export interface TiledExportSnapshot {
  source: TiledCanvasSnapshot;
  sourceScale: number;
}
export type ExportSnapshot = ExportCanvas | TiledExportSnapshot;

export interface ExportOptions {
  includePaperTexture?: boolean;
  preview?: {
    width: number;
    onReady: (preview: ImageBitmap) => void;
  };
}

type ExportBitmapResult =
  | { kind: 'tile'; bitmap: ImageBitmap; x: number; y: number }
  | { kind: 'texture' | 'overlay'; bitmap: ImageBitmap }
  | null;

function getExportContext(canvas: ExportCanvas): ExportContext | null {
  // The identical branches preserve the concrete canvas union long enough for
  // TypeScript to select each platform's distinct getContext overload.
  return canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : canvas.getContext('2d');
}

// Keyed by theme: the tiles are opaque, with each theme's paper color baked in
// (ADR-0100), so unlike the shared alpha grain they replaced there is no single
// image that serves both. A save right after a theme switch must not composite
// the other theme's paper.
const paperTextureImages: Partial<Record<ResolvedTheme, HTMLImageElement>> = {};
const paperTexturePromises: Partial<Record<ResolvedTheme, Promise<HTMLImageElement | null>>> = {};

function loadPaperTexture(theme: ResolvedTheme): Promise<HTMLImageElement | null> {
  const loaded = paperTextureImages[theme];
  if (loaded) return Promise.resolve(loaded);
  const pending = paperTexturePromises[theme];
  if (pending) return pending;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      paperTextureImages[theme] = img;
      resolve(img);
    };
    img.onerror = () => {
      delete paperTexturePromises[theme];
      resolve(null);
    };
    img.src = PAPER_TEXTURES[theme];
  });
  paperTexturePromises[theme] = promise;
  return promise;
}

function loadExportOverlay(
  overlaySource: ExportOverlaySource | null
): Promise<HTMLImageElement | null> {
  if (!overlaySource) return Promise.resolve(null);
  if (overlaySource.decodedCanonicalImage) {
    return Promise.resolve(overlaySource.decodedCanonicalImage);
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error(`Failed to load canonical coloring overlay: ${overlaySource.canonicalUrl}`));
    };
    image.src = overlaySource.canonicalUrl;
  });
}

// Warm the paper texture so the fetch + decode (~226ms) doesn't stall the
// first export. The engine calls this from its own idle warm of this module.
// Only the active theme is warmed — warming both would double the transfer to
// save a stall that only happens if the parent switches theme before saving.
export function warmPaperTexture() {
  void loadPaperTexture(resolvedTheme());
}

export async function composeExportPng(
  snapshot: ExportSnapshot,
  renderScale: number,
  overlaySource: ExportOverlaySource | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  const { includePaperTexture = true, preview } = options;

  // Resolve once up front so an OS theme switch mid-export can't mismatch the
  // paper fill and the overlay treatment. Coloring pages follow the resolved
  // theme just like free-draw (ADR-0052 direction B): a dark-mode save is the
  // night version — dark paper, the generated transparent white chalk overlay,
  // and the night-fill reveals already baked into the replayed strokes.
  const theme = resolvedTheme();

  if ('source' in snapshot) {
    const texture = includePaperTexture ? await loadPaperTexture(theme) : null;
    const bitmapRequests: Promise<ExportBitmapResult>[] = [
      ...snapshot.source.tiles.map(
        async (tile): Promise<ExportBitmapResult> => ({
          kind: 'tile',
          bitmap: await tile.bitmap,
          x: tile.x,
          y: tile.y,
        })
      ),
      Promise.resolve(texture ? createImageBitmap(texture) : null).then(
        (bitmap): ExportBitmapResult => (bitmap ? { kind: 'texture', bitmap } : null)
      ),
      loadExportOverlay(overlaySource)
        .then((image) => (image ? createImageBitmap(image) : null))
        .then((bitmap): ExportBitmapResult => (bitmap ? { kind: 'overlay', bitmap } : null)),
    ];
    const settledBitmaps = await Promise.allSettled(bitmapRequests);
    const failure = settledBitmaps.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      for (const result of settledBitmaps) {
        if (result.status === 'fulfilled') result.value?.bitmap.close();
      }
      throw failure.reason;
    }
    const tiles: Array<{ bitmap: ImageBitmap; x: number; y: number }> = [];
    let textureBitmap: ImageBitmap | null = null;
    let overlayBitmap: ImageBitmap | null = null;
    for (const result of settledBitmaps) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      if (result.value.kind === 'tile') {
        const { bitmap, x, y } = result.value;
        tiles.push({ bitmap, x, y });
      } else if (result.value.kind === 'texture') textureBitmap = result.value.bitmap;
      else overlayBitmap = result.value.bitmap;
    }
    return encodeTiledCanvasPng(
      {
        sourceWidth: snapshot.source.width,
        sourceHeight: snapshot.source.height,
        sourceScale: snapshot.sourceScale,
        exportScale: renderScale,
        tiles,
        texture: textureBitmap,
        overlay: overlayBitmap,
        paperColor: PAPER_COLORS[theme],
        previewWidth: preview?.width,
      },
      preview?.onReady
    );
  }

  const w = snapshot.width / renderScale;
  const h = snapshot.height / renderScale;

  const target = getExportContext(snapshot);
  if (!target) return null;
  const [texture, overlayImage] = await Promise.all([
    includePaperTexture ? loadPaperTexture(theme) : null,
    loadExportOverlay(overlaySource),
  ]);
  paintExportPaper(target, {
    width: w,
    height: h,
    scale: renderScale,
    paperColor: PAPER_COLORS[theme],
    texture,
  });
  if (overlayImage) {
    drawExportOverlay(
      target,
      {
        source: overlayImage,
        width: overlayImage.naturalWidth,
        height: overlayImage.naturalHeight,
      },
      { width: w, height: h, scale: renderScale }
    );
  }

  return encodeCanvasPng(snapshot);
}
