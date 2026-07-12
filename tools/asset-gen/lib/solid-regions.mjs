// Solid-region scoring for coloring-page line art, shared by the outline
// solidity auditor (audit-outline-solidity.mjs) and the thin-stroke normalizer
// (normalize-outline-strokes.mjs).
//
// Why this exists: dark mode renders the line art through a blanket invert(1)
// (ADR-0052) and the punch cuts every line-art-dark pixel out of the fills
// (lib/punch-fill.mjs). Both steps assume "dark pixel = thin outline stroke".
// A large SOLID black region (a cartoon pupil, a tire, a black patch) breaks
// both at once: its correct fill pixels are punched away and the invert paints
// the hole pure white — a white BLOB, where the eye accepts only white BORDERS.
// The fix is upstream (outlines carry thin strokes only); this module is the
// objective detector for "does this line art contain solid regions".
//
// The measure is a morphological opening: erode the dark mask by OPEN_RADIUS
// (just over half the boldest stroke width, so every stroke vanishes), then
// whatever survives is solid-interior area. `biggestBlob` — the largest
// connected surviving component — is the gate signal: a pupil reads in the
// hundreds of px, stroke junctions and antialiasing residue in the tens.
import sharp from 'sharp';

// Same ink bar as the punch mask (lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD),
// so "solid" is judged on exactly the pixels the punch would cut.
export const SOLID_LUMA_THRESHOLD = 150;

// Bounds for the erosion radius. The radius is derived per page from the
// MEASURED stroke width (see strokeWidthP90) rather than fixed: a fixed r=8
// missed nature/bee-tall's small solid pupils (~22px across — their core
// eroded away with the strokes), while the measured strokes on shipped pages
// are only ~4px wide (p90 ≈ 6-8 at junctions). r = ceil(p90/2) + 2 erases
// every stroke with margin and keeps a scoreable core in even a small pupil.
export const OPEN_RADIUS_MIN = 5;
export const OPEN_RADIUS_MAX = 8;

// Pass bars, calibrated on the shipped set at the adaptive radius. Two bars
// because they catch different cheats:
//   - biggestBlob: pages with solid (or crescent-solid) pupils score high
//     (owl-tall 2908, ant-tall pre-fix 1150, bee-tall 211, snail-tall 274)
//     while stroke-only pages stay low (junction residue < 30).
//   - interiorPx (the TOTAL surviving erosion, page-wide): a solid pupil whose
//     white catchlight holes FRAGMENT its eroded interior can sneak every
//     fragment under the blob bar (bee-tall's fake-hollow redraw: blob 46 but
//     103 total interior px vs 0-4 on truly thin-stroke pages).
export const SOLID_BLOB_MAX = 100;
export const SOLID_INTERIOR_MAX = 60;

function erode(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w || !mask[y * w + xx]) {
          on = 0;
          break;
        }
      }
      tmp[y * w + x] = on;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h || !tmp[yy * w + x]) {
          on = 0;
          break;
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function dilate(mask, w, h, r) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const eroded = erode(inv, w, h, r);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = eroded[i] ? 0 : 1;
  return out;
}

// 90th-percentile stroke width in px: two-pass chamfer distance-to-light over
// the ink mask, doubled. The p90 (not median) captures junction thickness, so
// the opening radius clears crossings without a blob-sized safety margin.
function strokeWidthP90(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? Infinity : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 1);
      if (y > 0) m = Math.min(m, d[i - w] + 1);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + 1.414);
      d[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + 1.414);
      d[i] = m;
    }
  }
  const vals = [];
  for (let i = 0; i < d.length; i++) if (mask[i]) vals.push(d[i]);
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return 2 * vals[Math.floor(vals.length * 0.9)];
}

function largestComponent(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let size = 0;
    let sp = 0;
    stack[sp++] = i;
    seen[i] = 1;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      const tryPush = (q) => {
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack[sp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x < w - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y < h - 1) tryPush(p + w);
    }
    if (size > best) best = size;
  }
  return best;
}

// Score one line art (webp/png buffer) at native resolution. Returns the counts
// plus the masks so callers can post-process (the normalizer whitens solid
// interiors before registration scoring).
//   darkPx      — ink pixels (luma < SOLID_LUMA_THRESHOLD)
//   interiorPx  — ink that survives the erosion (definitely not a stroke)
//   solidPx     — the opening (interior re-grown, clipped to ink): the full
//                 footprint of every solid region
//   biggestBlob — largest connected interior component; the gate signal
export async function scoreSolidity(outlineBuf, { openRadius } = {}) {
  const { data, info } = await sharp(outlineBuf)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const dark = new Uint8Array(w * h);
  let darkPx = 0;
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < SOLID_LUMA_THRESHOLD) {
      dark[p] = 1;
      darkPx++;
    }
  }
  const strokeW = strokeWidthP90(dark, w, h);
  const r =
    openRadius ?? Math.min(OPEN_RADIUS_MAX, Math.max(OPEN_RADIUS_MIN, Math.ceil(strokeW / 2) + 2));
  const interior = erode(dark, w, h, r);
  const grown = dilate(interior, w, h, r);
  const solid = new Uint8Array(w * h);
  let interiorPx = 0;
  let solidPx = 0;
  for (let p = 0; p < solid.length; p++) {
    if (interior[p]) interiorPx++;
    if (grown[p] && dark[p]) {
      solid[p] = 1;
      solidPx++;
    }
  }
  const biggestBlob = largestComponent(interior, w, h);
  return {
    width: w,
    height: h,
    darkPx,
    interiorPx,
    solidPx,
    biggestBlob,
    strokeWidth: strokeW,
    openRadius: r,
    passes: biggestBlob <= SOLID_BLOB_MAX && interiorPx <= SOLID_INTERIOR_MAX,
    masks: { dark, solid, interior },
  };
}

// Width of the boundary ring kept when whitening a solid region — about one
// stroke width, so the ring reads as the outline the redraw should trace.
const SOLID_RIM_WIDTH = 6;

// Copy of the line art with each solid region's INTERIOR painted white, keeping
// a rim ring on its boundary. The normalizer's registration gate scores against
// this instead of the raw source: the redraw is SUPPOSED to hollow out solid
// interiors (scoring against the unmodified source would count exactly that
// removal as drift), but the redrawn outline must still trace where each solid
// region's edge was — the kept rim is what verifies that.
export async function whitenSolidRegions(outlineBuf, solidity) {
  const {
    width: w,
    height: h,
    masks: { solid },
  } = solidity;
  const core = erode(solid, w, h, SOLID_RIM_WIDTH);
  const { data } = await sharp(outlineBuf)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    if (core[p]) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
}
