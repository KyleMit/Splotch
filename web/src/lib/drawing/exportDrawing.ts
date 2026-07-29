// Composes the shareable PNG of the current drawing: the theme's paper color,
// the handmade-paper texture, the strokes (snapshotted by the engine), and the
// coloring-page overlay on top — the same stack the child sees on screen. In
// dark mode the paper fill is the dark paper and the line art is inverted and
// screened, matching the on-screen --paper / --lineart-* tokens.
//
// Save-time-only, so the engine loads this module on demand (issue #461) —
// keep it free of static importers or it silently merges back into the startup
// bundle (web/tests/startup-bundle.spec.ts guards the modulepreload list). The
// stroke snapshot is taken synchronously by engine.exportCanvasBlob BEFORE the
// module load's await, so a clear racing the export can't blank it.

import { PAPER_COLORS, type ResolvedTheme } from '../theme';
import { resolvedTheme } from '../state/appearance.svelte';
import { containFit } from './paperView';

export interface ExportOptions {
  includePaperTexture?: boolean;
}

let paperTextureImage: HTMLImageElement | null = null;
let paperTexturePromise: Promise<HTMLImageElement | null> | null = null;

// The 2× export floor preserves crisp paper-texture and overlay resampling on
// 1x screens while balancing PNG size and canvas-memory use.
const MIN_EXPORT_SCALE = 2;

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
  target: CanvasRenderingContext2D,
  w: number,
  h: number,
  includePaperTexture: boolean,
  theme: ResolvedTheme
) {
  target.fillStyle = PAPER_COLORS[theme];
  target.fillRect(0, 0, w, h);
  if (!includePaperTexture) return;
  const texture = await loadPaperTexture();
  if (!texture) return;
  const pattern = target.createPattern(texture, 'repeat');
  if (!pattern) return;
  // The texture is a low-alpha grain layer, so it composites over either fill.
  target.fillStyle = pattern;
  target.fillRect(0, 0, w, h);
}

// Invert the (opaque) line art the way the on-screen --lineart-filter does.
// `ctx.filter = 'invert(1)'` isn't available at the Safari 16.4 floor, but a
// 'difference' fill with white is the same per-channel math.
function invertedOverlay(overlay: HTMLImageElement): HTMLCanvasElement | null {
  const inv = document.createElement('canvas');
  inv.width = overlay.naturalWidth;
  inv.height = overlay.naturalHeight;
  const ctx = inv.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(overlay, 0, 0);
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, inv.width, inv.height);
  return inv;
}

// The coloring page blends over the finished composite, contain-fit and
// centered — matching how the overlay <img> renders above the canvas: black
// lines multiplied over light paper, or (dark mode) the inverted white lines
// screened over the dark paper.
function drawOverlayContained(
  target: CanvasRenderingContext2D,
  overlay: HTMLImageElement,
  w: number,
  h: number,
  theme: ResolvedTheme
) {
  if (overlay.naturalWidth === 0 || overlay.naturalHeight === 0) return;
  const { scale, offsetX, offsetY } = containFit(
    { width: overlay.naturalWidth, height: overlay.naturalHeight },
    { width: w, height: h }
  );
  const drawnW = overlay.naturalWidth * scale;
  const drawnH = overlay.naturalHeight * scale;
  if (theme === 'dark') {
    const inverted = invertedOverlay(overlay);
    if (!inverted) {
      // No 2D context was available for the temporary inversion surface.
      target.globalCompositeOperation = 'source-over';
      return;
    }
    target.globalCompositeOperation = 'screen';
    target.drawImage(inverted, offsetX, offsetY, drawnW, drawnH);
  } else {
    target.globalCompositeOperation = 'multiply';
    target.drawImage(overlay, offsetX, offsetY, drawnW, drawnH);
  }
  target.globalCompositeOperation = 'source-over';
}

export async function composeExportPng(
  snapshot: HTMLCanvasElement,
  renderScale: number,
  overlayImage: HTMLImageElement | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  const { includePaperTexture = true } = options;

  // Resolve once up front so an OS theme switch mid-export can't mismatch the
  // paper fill and the overlay treatment. Coloring pages follow the resolved
  // theme just like free-draw (ADR-0052 direction B): a dark-mode save is the
  // night version — dark paper, inverted white "chalk" line art screened on top,
  // and the night-fill reveals already baked into the replayed strokes.
  const theme = resolvedTheme();

  const exportScale = Math.max(window.devicePixelRatio || 1, MIN_EXPORT_SCALE);
  const w = snapshot.width / renderScale;
  const h = snapshot.height / renderScale;

  const out = document.createElement('canvas');
  out.width = Math.round(w * exportScale);
  out.height = Math.round(h * exportScale);
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.scale(exportScale, exportScale);

  await paintPaperBackground(outCtx, w, h, includePaperTexture, theme);
  outCtx.drawImage(snapshot, 0, 0, w, h);
  if (overlayImage) drawOverlayContained(outCtx, overlayImage, w, h, theme);

  return await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}
