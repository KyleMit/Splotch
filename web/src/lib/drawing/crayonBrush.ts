// Crayon brush (ADR-0065): a wax-crayon pen tip built from two independent
// pieces — a deterministic paper-tooth texture, and swept-pass stroke geometry
// whose split decisions live in CrayonPassTracker.
//
// TEXTURE. One seamless "paper height" tile per session: multi-octave value
// noise with a light domain warp, mapped through a continuous transfer curve
// to per-texel ALPHA only. The tile's RGB is the exact selected color, so
// overdraw deepens coverage (source-over: 1-(1-a)^n) while the hue never
// shifts. The transfer keeps a small nonzero valley — no permanent white pits;
// enough scribbling colors every texel in — under a near-opaque peak, leaving
// visible first-pass headroom so a genuine second pass reads denser. The tile
// is anchored to the paper origin (fixed phase, like the magic sheet), so the
// tooth never moves between live rendering and undo/resize/export replay.
//
// GEOMETRY. A crayon gesture is recorded as a sequence of PASSES — each one
// polyline rendered by a single stroke() call. Canvas path-union semantics
// deposit the tile exactly once over the pass's swept area, so pointer-frame
// boundaries can never double-deposit (no periodic cap circles, and density is
// independent of pointer event rate). A new pass begins only where the
// physical crayon genuinely covers the same paper again: a sharp reversal, or
// the tip re-entering the strip it already laid down. Consecutive passes
// composite source-over, so true backtracking and self-crossing build up live
// under the finger.

import { scheduleIdle } from '../idle';

export const CRAYON_TILE_CSS_PX = 256;

// Transfer curve from paper height to deposited alpha. Contrast stretches the
// value-noise sum (which clusters near 0.5), a smoothstep polarizes it toward
// the ends — crisp near-white flecks in a dense wax body rather than cloudy
// mottling — and gamma < 1 biases the split toward the body. The valley stays
// small but NONZERO: tooth holes look white on the first pass yet color in
// under real overdraw (no permanent pits).
const VALLEY_ALPHA = 0.05;
const PEAK_ALPHA = 0.96;
const CONTRAST = 2.7;
const GAMMA = 0.48;

// Octaves of the height field, in lattice cells across one tile (cells must be
// integers so the lattice wraps seamlessly). Feature size ≈ 256/cells CSS px;
// amplitudes concentrate energy in the fine-to-medium tooth with only a subtle
// large-scale density drift, per the review of the reference sheet.
const OCTAVES: { cells: number; amp: number }[] = [
  { cells: 5, amp: 0.22 },
  { cells: 13, amp: 0.38 },
  { cells: 31, amp: 0.78 },
  { cells: 79, amp: 1.0 },
  { cells: 127, amp: 0.4 },
];

// Light domain warp breaks the value-noise lattice regularity without harming
// seamlessness (the warp field shares the tile period, and the warped sample
// wraps through the same lattice).
const WARP_CELLS = 17;
const WARP_AMP_CSS_PX = 2.2;

// Deterministic 2D lattice hash → [0,1). Plain integer mixing — no Math.random
// anywhere in this module, so the same coordinates always produce the same
// paper.
function latticeHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Periodic value noise: bilinear interpolation over a wrapped integer lattice
// of `cells` cells across one tile, sampled at CSS-px coordinates. Periodic in
// u/v with period CRAYON_TILE_CSS_PX for any integer cell count.
function periodicValueNoise(u: number, v: number, cells: number, salt: number): number {
  const scale = cells / CRAYON_TILE_CSS_PX;
  const x = u * scale;
  const y = v * scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const ix0 = ((x0 % cells) + cells) % cells;
  const iy0 = ((y0 % cells) + cells) % cells;
  const ix1 = (ix0 + 1) % cells;
  const iy1 = (iy0 + 1) % cells;
  const v00 = latticeHash(ix0, iy0, salt);
  const v10 = latticeHash(ix1, iy0, salt);
  const v01 = latticeHash(ix0, iy1, salt);
  const v11 = latticeHash(ix1, iy1, salt);
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

// Paper height at a CSS-px coordinate, in [0,1]: domain-warped fBm normalized
// by total amplitude. Pure and deterministic — exported for unit tests.
export function crayonToothHeight(u: number, v: number): number {
  const warpU = u + (periodicValueNoise(u, v, WARP_CELLS, 101) - 0.5) * 2 * WARP_AMP_CSS_PX;
  const warpV = v + (periodicValueNoise(u, v, WARP_CELLS, 202) - 0.5) * 2 * WARP_AMP_CSS_PX;
  let sum = 0;
  let ampTotal = 0;
  for (let i = 0; i < OCTAVES.length; i++) {
    const { cells, amp } = OCTAVES[i];
    sum += periodicValueNoise(warpU, warpV, cells, 7 + i) * amp;
    ampTotal += amp;
  }
  return sum / ampTotal;
}

// Height → deposited alpha, in [VALLEY_ALPHA, PEAK_ALPHA]. Exported for unit
// tests (bounds, continuity, nonzero valley).
export function crayonDepositAlpha(height: number): number {
  const stretched = Math.min(1, Math.max(0, (height - 0.5) * CONTRAST + 0.5));
  const polarized = stretched * stretched * (3 - 2 * stretched);
  return VALLEY_ALPHA + (PEAK_ALPHA - VALLEY_ALPHA) * Math.pow(polarized, GAMMA);
}

// The alpha field is generated at device resolution (tile side × renderScale)
// but SAMPLED in CSS px, so the tooth is the same visual size relative to the
// stroke on every device — renderScale already scales the stroke widths.
let alphaFieldCache: { renderScale: number; size: number; alpha: Uint8ClampedArray } | null = null;

export function crayonAlphaField(renderScale: number): { size: number; alpha: Uint8ClampedArray } {
  if (alphaFieldCache && alphaFieldCache.renderScale === renderScale) return alphaFieldCache;
  const size = Math.round(CRAYON_TILE_CSS_PX * renderScale);
  const alpha = new Uint8ClampedArray(size * size);
  for (let py = 0; py < size; py++) {
    const v = py / renderScale;
    for (let px = 0; px < size; px++) {
      const u = px / renderScale;
      alpha[py * size + px] = Math.round(crayonDepositAlpha(crayonToothHeight(u, v)) * 255);
    }
  }
  alphaFieldCache = { renderScale, size, alpha };
  return alphaFieldCache;
}

// Palette and picker colors are hex; a tiny parser keeps the hot path off a
// scratch canvas. Anything else (future named/hsl colors) falls back to one.
export function parseCrayonColor(color: string): { r: number; g: number; b: number } | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return null;
  let s = hex[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function resolveColor(color: string): { r: number; g: number; b: number } {
  const parsed = parseCrayonColor(color);
  if (parsed) return parsed;
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const g = probe.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
}

// The engine pins this at init (fixed for the session, like its renderScale);
// every cache below keys off it so a stale scale can never leak between
// sessions with different DPRs.
let crayonRenderScale = 1;

export function setCrayonRenderScale(scale: number) {
  if (scale === crayonRenderScale) return;
  crayonRenderScale = scale;
  tileCache.clear();
  patternCache = new WeakMap();
}

// Tinted tiles per color: exact RGB everywhere, the shared alpha field as
// coverage. Bounded — a child cycles through a handful of colors; evicting the
// oldest just costs a rebuild if they return to it much later.
const MAX_TILE_CACHE = 12;
const tileCache = new Map<string, HTMLCanvasElement>();

export function crayonTileFor(color: string): HTMLCanvasElement {
  const cached = tileCache.get(color);
  if (cached) return cached;
  const { size, alpha } = crayonAlphaField(crayonRenderScale);
  const { r, g, b } = resolveColor(color);
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext('2d')!;
  const image = tileCtx.createImageData(size, size);
  const data = image.data;
  for (let i = 0; i < alpha.length; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = alpha[i];
  }
  tileCtx.putImageData(image, 0, 0);
  if (tileCache.size >= MAX_TILE_CACHE) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  tileCache.set(color, tile);
  return tile;
}

// Repeating pattern of the color's tile, cached per target context (the
// visible ctx almost always; baseline/keyframe/export contexts on replay).
// Patterns are anchored at the context origin — paper coordinate (0,0) — so
// every surface samples identical grain for identical op coordinates.
let patternCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

export function crayonPatternFor(
  target: CanvasRenderingContext2D,
  color: string
): CanvasPattern | null {
  let byColor = patternCache.get(target);
  if (!byColor) {
    byColor = new Map();
    patternCache.set(target, byColor);
  }
  const cached = byColor.get(color);
  if (cached) return cached;
  const pattern = target.createPattern(crayonTileFor(color), 'repeat');
  if (pattern) byColor.set(color, pattern);
  return pattern;
}

// Pre-generate the shared field and the active color's tile off the pointer
// hot path — scheduled when the crayon is selected or its color changes, so
// the first stroke rarely pays the one-time field generation (~tens of ms).
// If a stroke lands before idle fires, crayonPatternFor builds synchronously —
// a one-time cost, never repeated.
export function warmCrayonTileWhenIdle(color: string) {
  scheduleIdle(() => void crayonTileFor(color));
}

// --- Swept-pass split tracking ----------------------------------------------

export interface CrayonPoint {
  x: number;
  y: number;
}

// Split triggers, all relative to the stroke width so thick and thin crayons
// feel the same:
//  • direction is measured between anchors at least DIR_STEP apart, so pixel
//    jitter while holding still can neither split nor rotate the direction;
//  • a turn sharper than SPLIT_TURN_COS is a reversal — the tip is heading
//    back over wax it just laid, so the pass splits immediately;
//  • re-entry: the tip landing within PROXIMITY_FRACTION of the width of a
//    point laid at least EXCLUDE_ARC_FRACTION widths of arc ago means the path
//    looped or hairpinned back onto its own strip without a sharp corner.
//    The trailing arc is excluded because the tip is always near the strip it
//    just painted.
const SPLIT_TURN_COS = Math.cos((100 * Math.PI) / 180);
const DIR_STEP_FRACTION = 0.35;
const PROXIMITY_FRACTION = 0.45;
const EXCLUDE_ARC_FRACTION = 2.5;
const ANCHOR_SPACING_FRACTION = 0.25;

// Decides where a crayon gesture's polyline must split into a new deposition
// pass. Pure geometry — one instance per pass, fed points in order.
export class CrayonPassTracker {
  private readonly dirStep: number;
  private readonly proximity: number;
  private readonly excludeArc: number;
  private readonly anchorSpacing: number;

  private anchors: { x: number; y: number; arc: number }[] = [];
  private arc = 0;
  private lastX: number;
  private lastY: number;
  private dirX = 0;
  private dirY = 0;
  private hasDir = false;
  private dirOriginX: number;
  private dirOriginY: number;

  constructor(startX: number, startY: number, lineWidth: number) {
    this.dirStep = Math.max(3, lineWidth * DIR_STEP_FRACTION);
    this.proximity = Math.max(2, lineWidth * PROXIMITY_FRACTION);
    this.excludeArc = Math.max(this.dirStep * 3, lineWidth * EXCLUDE_ARC_FRACTION);
    this.anchorSpacing = Math.max(2, lineWidth * ANCHOR_SPACING_FRACTION);
    this.lastX = startX;
    this.lastY = startY;
    this.dirOriginX = startX;
    this.dirOriginY = startY;
    this.anchors.push({ x: startX, y: startY, arc: 0 });
  }

  // Advance the tip to p. Returns 'split' when a new pass must start at the
  // PREVIOUS point (the caller closes the current pass there and re-seeds a
  // tracker for the new one); 'extend' otherwise, with p consumed.
  advance(p: CrayonPoint): 'extend' | 'split' {
    if (this.reversalAt(p) || this.reentryAt(p)) return 'split';
    this.consume(p);
    return 'extend';
  }

  private reversalAt(p: CrayonPoint): boolean {
    const dx = p.x - this.dirOriginX;
    const dy = p.y - this.dirOriginY;
    const len = Math.hypot(dx, dy);
    if (len < this.dirStep) return false;
    if (!this.hasDir) return false;
    const dot = (dx / len) * this.dirX + (dy / len) * this.dirY;
    return dot < SPLIT_TURN_COS;
  }

  private reentryAt(p: CrayonPoint): boolean {
    const stepArc = Math.hypot(p.x - this.lastX, p.y - this.lastY);
    const tipArc = this.arc + stepArc;
    for (const a of this.anchors) {
      if (tipArc - a.arc <= this.excludeArc) break;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      if (dx * dx + dy * dy <= this.proximity * this.proximity) return true;
    }
    return false;
  }

  private consume(p: CrayonPoint) {
    this.arc += Math.hypot(p.x - this.lastX, p.y - this.lastY);
    this.lastX = p.x;
    this.lastY = p.y;

    const dx = p.x - this.dirOriginX;
    const dy = p.y - this.dirOriginY;
    const len = Math.hypot(dx, dy);
    if (len >= this.dirStep) {
      this.dirX = dx / len;
      this.dirY = dy / len;
      this.hasDir = true;
      this.dirOriginX = p.x;
      this.dirOriginY = p.y;
    }

    const lastAnchor = this.anchors[this.anchors.length - 1];
    const ax = p.x - lastAnchor.x;
    const ay = p.y - lastAnchor.y;
    if (ax * ax + ay * ay >= this.anchorSpacing * this.anchorSpacing) {
      this.anchors.push({ x: p.x, y: p.y, arc: this.arc });
    }
  }
}
