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

import { PAPER_COLORS } from '../theme';
import { resolvedTheme } from '../state/appearance.svelte';
import { drawExportOverlay, paintExportPaper, type ExportContext } from './exportCompositor';
import type { ExportOverlaySource } from './overlay';
import { encodeCanvasPng, encodeTiledCanvasPng } from './pngEncoder';
import type { TiledCanvasSnapshot } from './tiledSurfaces';

type ExportCanvas = HTMLCanvasElement | OffscreenCanvas;
// ADR-0088 measured the isolated preview near 230 ms; optional feedback gets
// generous headroom without pinning the save pipeline after a stalled tile read.
const COMPATIBILITY_PREVIEW_TIMEOUT_MS = 1_000;

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
    source?: TiledExportSnapshot;
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

async function deliverTiledPreview(
  preview: NonNullable<ExportOptions['preview']>,
  paperColor: string,
  texture: CanvasImageSource | null,
  overlayImage: HTMLImageElement | null,
  signal: AbortSignal
) {
  if (!preview.source) return;
  const resolvedBitmaps = new Set<ImageBitmap>();
  const closeResolvedBitmaps = () => {
    for (const bitmap of resolvedBitmaps) bitmap.close();
    resolvedBitmaps.clear();
  };
  signal.addEventListener('abort', closeResolvedBitmaps, { once: true });

  try {
    const tiles = await Promise.all(
      preview.source.source.tiles.map(async ({ bitmap: bitmapPromise, x, y }) => {
        const bitmap = await bitmapPromise;
        if (signal.aborted) {
          bitmap.close();
          throw new Error('Compatibility preview timed out');
        }
        resolvedBitmaps.add(bitmap);
        return { bitmap, x, y };
      })
    );
    const logicalWidth = preview.source.source.width / preview.source.sourceScale;
    const logicalHeight = preview.source.source.height / preview.source.sourceScale;
    const outputScale = preview.width / logicalWidth;
    const outputHeight = Math.max(1, Math.round(logicalHeight * outputScale));
    const canvas = new OffscreenCanvas(preview.width, outputHeight);
    const context = canvas.getContext('2d');
    if (!context) return;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const tileScale = outputScale / preview.source.sourceScale;
    context.setTransform(tileScale, 0, 0, tileScale, 0, 0);
    for (const tile of tiles) context.drawImage(tile.bitmap, tile.x, tile.y);
    context.resetTransform();
    paintExportPaper(context, {
      width: logicalWidth,
      height: logicalHeight,
      scale: outputScale,
      paperColor,
      texture,
    });
    if (overlayImage) {
      drawExportOverlay(
        context,
        {
          source: overlayImage,
          width: overlayImage.naturalWidth,
          height: overlayImage.naturalHeight,
        },
        { width: logicalWidth, height: logicalHeight, scale: outputScale }
      );
    }
    let bitmap: ImageBitmap | null = canvas.transferToImageBitmap();
    try {
      preview.onReady(bitmap);
      bitmap = null;
    } finally {
      bitmap?.close();
    }
  } finally {
    signal.removeEventListener('abort', closeResolvedBitmaps);
    closeResolvedBitmaps();
  }
}

async function deliverTiledPreviewBeforeExport(
  preview: NonNullable<ExportOptions['preview']>,
  paperColor: string,
  texture: CanvasImageSource | null,
  overlayImage: HTMLImageElement | null
) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      deliverTiledPreview(preview, paperColor, texture, overlayImage, controller.signal),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          resolve();
        }, COMPATIBILITY_PREVIEW_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    controller.abort();
  }
}

function closeTiledPreviewSource(preview: ExportOptions['preview']) {
  if (!preview?.source) return;
  for (const { bitmap } of preview.source.source.tiles) {
    void bitmap.then(
      (resolved) => resolved.close(),
      () => undefined
    );
  }
}

// Warm the paper texture so the fetch + decode (~226ms) doesn't stall the
// first export. The engine calls this from its own idle warm of this module.
export function warmPaperTexture() {
  void loadPaperTexture();
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
    const texture = includePaperTexture ? await loadPaperTexture() : null;
    const bitmapRequests: Promise<ExportBitmapResult>[] = [
      ...snapshot.source.tiles.map(async (tile): Promise<ExportBitmapResult> => ({
        kind: 'tile',
        bitmap: await tile.bitmap,
        x: tile.x,
        y: tile.y,
      })),
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
  if (!target) {
    closeTiledPreviewSource(preview);
    return null;
  }
  let texture: HTMLImageElement | null;
  let overlayImage: HTMLImageElement | null;
  try {
    [texture, overlayImage] = await Promise.all([
      includePaperTexture ? loadPaperTexture() : null,
      loadExportOverlay(overlaySource),
    ]);
  } catch (error) {
    closeTiledPreviewSource(preview);
    throw error;
  }
  if (preview?.source) {
    try {
      // Mount the short-lived feedback before compatibility composition begins,
      // but never let optional feedback pin the save or its coalescing promise.
      await deliverTiledPreviewBeforeExport(preview, PAPER_COLORS[theme], texture, overlayImage);
    } catch {
      // Preview feedback is optional; its failure must not cancel the save.
    }
  }
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
