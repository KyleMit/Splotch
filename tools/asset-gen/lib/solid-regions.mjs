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

// Erosion radius in native px. Shipped line art is ~1024px on the short edge
// with strokes ~6-14px wide; r=8 erases every stroke while a pupil (~25-60px
// across) keeps a core. All shipped pages share that scale, so a fixed native
// radius means the same thing everywhere.
export const OPEN_RADIUS = 8;

// Pass bar for biggestBlob, calibrated on the shipped set: the visibly-broken
// pages score high (owl-tall pupils 1919, ant-tall 1150, trex-tall 832) while
// genuinely stroke-only pages score near zero (bee-tall 23, stegosaurus-tall 12,
// most covers 0). Junction/antialiasing residue stays well under 100. The bar is
// advisory — the audit lists candidates for normalization, worst first.
export const SOLID_BLOB_MAX = 100;

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
export async function scoreSolidity(outlineBuf, { openRadius = OPEN_RADIUS } = {}) {
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
  const interior = erode(dark, w, h, openRadius);
  const grown = dilate(interior, w, h, openRadius);
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
    passes: biggestBlob <= SOLID_BLOB_MAX,
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
