// Outline-registration scoring shared by the fill generator (gen-coloring-fills.mjs,
// the quality gate) and the drift auditor (check-coloring-drift.mjs). Given a source
// line-art page and a colored candidate, it measures how well the candidate's black
// outlines still sit on top of the source's — the whole premise of the magic-brush
// twin (ADR-0043) is that the two register pixel-for-pixel.
//
// Two scores, because a single global number hides the failure mode we actually hit:
//   - `keep`      — GLOBAL fraction of the source outline covered by candidate ink
//                   within ±TOL. A big well-aligned subject (an ant body) can hold
//                   this near 1.0 while a small feature (a flower) is badly drifted,
//                   because the average is dominated by the subject's pixels.
//   - `localKeep` — the WORST tile's keep over a grid. This is what catches a
//                   localized drift the global average buries: nature/ant-wide scored
//                   93% global keep (passing the old gate) but 34% on its drifted
//                   flower tile. Gate on this, not just the global keep.
import sharp from 'sharp';

// Work resolution for the masks. Everything is compared at this fixed size so the
// tolerance and tile grid mean the same thing regardless of the page's native pixels.
const MASK_W = 512;
// A grayscale pixel darker than this counts as ink (outline — or a genuinely dark
// fill, which the ±TOL tolerance and the overlay's blue channel account for).
const THRESHOLD = 110;
// Match tolerance in mask pixels: a 1px-thicker or anti-aliased line still counts as
// aligned, so only real movement reads as drift.
const TOL = 2;

// Local drift grid. The source outline is bucketed into GRID×GRID tiles and each
// tile scored on its own; `localKeep` is the minimum over tiles that carry at least
// TILE_MIN_INK source pixels (sparser tiles are too noisy to score).
const GRID = 8;
const TILE_MIN_INK = 50;

// Pass bars, shared by the generation gate and the shipped-twin auditor so they
// can't drift apart. A twin must hold this much of the source outline globally AND
// in its worst tile. The local bar sits in the gap between the clearly-drifted
// shipped twins (worst tile ≤ 80%) and the clean ones (≥ 83%).
export const KEEP_THRESHOLD = 0.92;
export const LOCAL_KEEP_THRESHOLD = 0.8;

// Downscaled binary mask of the dark (outline) pixels of an image.
async function darkMask(buf) {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(MASK_W, MASK_W, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(MASK_W * MASK_W);
  for (let i = 0; i < data.length; i++) mask[i] = data[i] < THRESHOLD ? 1 : 0;
  return mask;
}

// Whether a mask has any set pixel within `r` of index i (a cheap dilation test),
// so a slightly thicker or anti-aliased line still counts as a match.
function nearby(mask, i, r) {
  const x = i % MASK_W;
  const y = (i / MASK_W) | 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= MASK_W) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= MASK_W) continue;
      if (mask[yy * MASK_W + xx]) return true;
    }
  }
  return false;
}

// Compare the outline of the source page against a colored candidate, tolerant of
// ±TOL px. Returns:
//   keep      = global fraction of the source outline with candidate ink within TOL.
//   drift     = 1 - keep.
//   localKeep = the worst tile's keep (min over tiles with >= TILE_MIN_INK source
//               ink) — the localized-drift score the global keep can hide.
//   worstTile = { x, y, keep } of that worst tile, for reporting.
//   overlay   = PNG showing ONLY genuine mismatches: source ink that drifted = red,
//               candidate ink far from any source line (invented detail / dark fill)
//               = blue, everything aligned = near-black.
export async function outlineMatch(sourceBuf, filledBuf) {
  const src = await darkMask(sourceBuf);
  const fill = await darkMask(filledBuf);
  let srcCount = 0;
  let covered = 0;
  const tileSrc = new Int32Array(GRID * GRID);
  const tileCov = new Int32Array(GRID * GRID);
  const rgb = Buffer.alloc(MASK_W * MASK_W * 3, 255);
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    const f = fill[i];
    const p = i * 3;
    if (s) {
      srcCount++;
      const tx = Math.min(GRID - 1, (((i % MASK_W) / MASK_W) * GRID) | 0);
      const ty = Math.min(GRID - 1, ((((i / MASK_W) | 0) / MASK_W) * GRID) | 0);
      const t = ty * GRID + tx;
      tileSrc[t]++;
      if (nearby(fill, i, TOL)) {
        covered++;
        tileCov[t]++;
        rgb[p] = 30;
        rgb[p + 1] = 30;
        rgb[p + 2] = 30;
      } else {
        rgb[p] = 230;
        rgb[p + 1] = 50;
        rgb[p + 2] = 50;
      }
    } else if (f && !nearby(src, i, TOL)) {
      rgb[p] = 80;
      rgb[p + 1] = 120;
      rgb[p + 2] = 235;
    }
  }
  const keep = srcCount ? covered / srcCount : 0;
  let localKeep = 1;
  let worstTile = null;
  for (let ty = 0; ty < GRID; ty++) {
    for (let tx = 0; tx < GRID; tx++) {
      const t = ty * GRID + tx;
      if (tileSrc[t] < TILE_MIN_INK) continue;
      const k = tileCov[t] / tileSrc[t];
      if (k < localKeep) {
        localKeep = k;
        worstTile = { x: tx, y: ty, keep: k };
      }
    }
  }
  const overlay = await sharp(rgb, { raw: { width: MASK_W, height: MASK_W, channels: 3 } })
    .png()
    .toBuffer();
  return { keep, drift: 1 - keep, localKeep, worstTile, overlay };
}
