// Composes the shareable PNG of the current drawing: the theme's paper color,
// the handmade-paper texture, the strokes (rebuilt from undo history), and the
// coloring-page overlay on top — the same stack the child sees on screen. In
// dark mode the paper fill is the dark paper and the line art is inverted and
// screened, matching the on-screen --paper / --lineart-* tokens.

import { replayAll } from './undoHistory';
import { scheduleIdle } from '../idle';
import { PAPER_COLORS } from '../theme';
import { resolvedTheme } from '../state/appearance.svelte';

export interface ExportOptions {
  includePaperTexture?: boolean;
}

// The paper geometry the engine owns (ADR-0050): the pixel size of the space
// ops are recorded in, and the render scale that maps it back to CSS pixels.
interface ExportSource {
  paperPxWidth: number;
  paperPxHeight: number;
  renderScale: number;
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
    img.onerror = () => resolve(null);
    img.src = '/icons/handmade-paper.webp';
  });
  return paperTexturePromise;
}

// Warm the paper texture off the critical path so the fetch + decode (~226ms)
// doesn't stall the first export.
export function warmPaperTextureWhenIdle() {
  scheduleIdle(() => void loadPaperTexture());
}

// Rebuild the strokes in PAPER space (baseline + log + any in-flight stroke)
// rather than copying the visible canvas: under a rotation-locked view the
// visible canvas is the letterboxed presentation, and the export should be the
// full upright page.
function snapshotStrokes(source: ExportSource): HTMLCanvasElement {
  const snapshot = document.createElement('canvas');
  snapshot.width = source.paperPxWidth;
  snapshot.height = source.paperPxHeight;
  const snapshotCtx = snapshot.getContext('2d')!;
  snapshotCtx.lineCap = 'round';
  snapshotCtx.lineJoin = 'round';
  replayAll(snapshotCtx);
  return snapshot;
}

async function paintPaperBackground(
  target: CanvasRenderingContext2D,
  w: number,
  h: number,
  includePaperTexture: boolean,
  theme: 'light' | 'dark'
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
  theme: 'light' | 'dark'
) {
  if (overlay.naturalWidth === 0 || overlay.naturalHeight === 0) return;
  const scale = Math.min(w / overlay.naturalWidth, h / overlay.naturalHeight);
  const drawnW = overlay.naturalWidth * scale;
  const drawnH = overlay.naturalHeight * scale;
  const dark = theme === 'dark';
  const source: CanvasImageSource = (dark && invertedOverlay(overlay)) || overlay;
  target.globalCompositeOperation = source === overlay ? 'multiply' : 'screen';
  target.drawImage(source, (w - drawnW) / 2, (h - drawnH) / 2, drawnW, drawnH);
  target.globalCompositeOperation = 'source-over';
}

export async function exportDrawing(
  source: ExportSource,
  overlayImage: HTMLImageElement | null = null,
  options: ExportOptions = {}
): Promise<Blob | null> {
  const { includePaperTexture = true } = options;
  if (source.paperPxWidth === 0 || source.paperPxHeight === 0) return null;

  // Resolve once up front so an OS theme switch mid-export can't mismatch the
  // paper fill and the overlay treatment. A coloring page (overlayImage present)
  // forces the light sheet even in dark mode — mirroring :root[data-coloring] on
  // screen — so the exported page reads as black lines on white paper, not
  // inverted white lines on charcoal.
  const theme = overlayImage ? 'light' : resolvedTheme();

  // Snapshot the strokes before any await: save-on-delete fire-and-forgets the
  // export and then clears the live canvas synchronously, so snapshotting after
  // the paper-texture await (even a cache hit yields a microtask) would export
  // a blank page.
  const snapshot = snapshotStrokes(source);

  // Compose in CSS-pixel coordinates at an export scale of at least 2×, so the
  // paper texture and overlay keep their on-screen proportions while the
  // already-high-res strokes pass through with minimal resampling.
  const exportScale = Math.max(window.devicePixelRatio || 1, 2);
  const w = snapshot.width / source.renderScale;
  const h = snapshot.height / source.renderScale;

  const out = document.createElement('canvas');
  out.width = Math.round(w * exportScale);
  out.height = Math.round(h * exportScale);
  const outCtx = out.getContext('2d')!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.scale(exportScale, exportScale);

  await paintPaperBackground(outCtx, w, h, includePaperTexture, theme);
  outCtx.drawImage(snapshot, 0, 0, w, h);
  if (overlayImage) drawOverlayContained(outCtx, overlayImage, w, h, theme);

  return await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}
