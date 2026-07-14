// Night-fill scoring shared by the dark-fill generator (bin/gen-coloring-fills-dark.mjs,
// its per-take gates) and the golden-score auditor (bin/audit-golden.mjs). Extracted so
// the committed night raws can be re-scored offline with EXACTLY the generation-time
// math — the same reason lib/outline-match.mjs is shared with the light gate.
//
// Three scores, one per failure mode the night generator hits:
//   scoreDrift()     — invented white outlines far from any source line.
//   scoreNightness() — a bright/daytime background instead of a deep evening sky.
//   scoreLineColor() — the model re-inked the white outlines DARK.
import sharp from 'sharp';
import { dilateMask, erodeMask } from './morphology.mjs';

// --- Drift detection ----------------------------------------------------------
// A night fill's white pixels are outlines; the model has drifted when it draws a
// white outline where the source line art has none. We rasterize both at a working
// width, mark the source's outline pixels (dark in the black-on-white source),
// dilate that mask to absorb registration slack + the fill's glow, then count
// fill white/low-chroma pixels that fall outside it. Normalized by the source
// outline mass so pages of different line density compare on one scale.
const DRIFT_W = 512; // working width for the comparison
const DRIFT_SRC_DARK = 110; // source pixel darker than this = a line
const DRIFT_DILATE = 6; // px of slack around each source line (registration + glow)
const DRIFT_THIN = 3; // white strokes up to ~2*this px wide are outline-like, not fills
const DRIFT_LUMA_WHITE = 185; // fill pixel this bright...
const DRIFT_CHROMA_MAX = 45; // ...and this desaturated = a white outline, not a fill
// Above this share of invented white (relative to source outline mass) a render is
// regenerated. Clean fills score 0; a stray invented shape lands well above this.
export const DRIFT_THRESHOLD_DEFAULT = 0.004;

// --- Night-ness detection -----------------------------------------------------
// The model also drifts on MOOD — painting a bright daytime "sky blue" (or white)
// background instead of a night sky. The TRUE background (the open area outside
// every shape, flood-filled from the border through the source's white) must be a
// deep evening tone. We report its MEDIAN luma — robust to a bright edge-touching
// shape (ground, planet) leaking into the fill — so a genuinely dark night sky
// stays low even then, while a daytime sky reads bright. Known-good night fills
// sit at ~15-32; sky-blue daytime is ~150+.
const NIGHT_W = 384;
const NIGHT_SRC_LIGHT = 170; // source pixel brighter than this = background candidate
export const NIGHT_BG_LUMA_MAX_DEFAULT = 60; // median background luma above this = too bright / daytime (3.1-migration bar; shipped catalog is 18-48)
const NIGHT_MIN_BG_FRAC = 0.04; // skip the check if there's barely any open background

export async function scoreNightness(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(NIGHT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (!bg[i] && s.data[i] > NIGHT_SRC_LIGHT) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  const lumas = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  // Too little open background to judge (e.g. a full-bleed subject): treat as fine.
  if (lumas.length < n * NIGHT_MIN_BG_FRAC) return { bgLuma: 0, bgFrac: lumas.length / n };
  lumas.sort((a, b) => a - b);
  return { bgLuma: lumas[lumas.length >> 1], bgFrac: lumas.length / n };
}

export async function scoreDrift(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(DRIFT_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(DRIFT_W, null, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const outline = new Uint8Array(n);
  let srcCount = 0;
  for (let i = 0; i < n; i++) {
    if (s.data[i] < DRIFT_SRC_DARK) {
      outline[i] = 1;
      srcCount++;
    }
  }
  const allowed = dilateMask(outline, w, h, DRIFT_DILATE);

  // Bright, desaturated pixels in the fill — outlines AND any pale/white fill
  // (a moonlit face, a water droplet). We only want INVENTED OUTLINES, so keep the
  // THIN white and drop the thick blobs: an erode-then-dilate (opening) preserves
  // fill blobs; whatever the opening removes was a thin stroke. An invented shape's
  // outline survives; a legit pale fill region does not, so pale-subject pages
  // aren't false-flagged as drift.
  const white = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (luma > DRIFT_LUMA_WHITE && chroma < DRIFT_CHROMA_MAX) white[i] = 1;
  }
  const blobs = dilateMask(erodeMask(white, w, h, DRIFT_THIN), w, h, DRIFT_THIN);
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (white[i] && !blobs[i] && !allowed[i]) added++; // thin white, far from a source line
  }
  return { ratio: srcCount ? added / srcCount : 0, added, srcCount };
}

// --- Line-color detection -----------------------------------------------------
// The fill's outlines must stay WHITE — in dark mode they sit under the app's
// white "chalk" line art, so a fill whose outlines came back DARK (the model
// re-inked every shape with a black/brown stroke instead of keeping them white)
// doubles against the chalk and reads wrong. The source (black-on-white) says
// exactly WHERE the outlines are; at each, a good fill has a bright WHITE line and
// a dark-lined fill has only dark ink. Per source-outline pixel we take the
// brightest fill luma within 1px (absorbing a pixel of registration slack) and
// report the MEDIAN. Calibrated on a labeled Farm batch: fully dark-lined fills
// read ~65-135, white-lined ~154-250. Reject below --line-white-min (default 150,
// the highest cut that still clears the good set's floor). A pale, patchy subject
// (a mostly-white dog with a few dark contours) is the hard case — it can land near
// the boundary, so a flagged page may need a targeted low-temp regen to come back
// cleanly white; eyeball borderline pages in the coloring-book proof sheet.
const LINE_W = 512;
const LINE_SRC_DARK = 110; // source pixel darker than this = an outline
export const LINE_WHITE_MIN_DEFAULT = 150; // median outline brightness below this = dark outlines

export async function scoreLineColor(fillBuf, sourceBuf) {
  const s = await sharp(sourceBuf)
    .resize(LINE_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const t = await sharp(fillBuf)
    .resize(LINE_W, null, { fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = s.info.width;
  const h = s.info.height;
  const maxes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (s.data[y * w + x] >= LINE_SRC_DARK) continue; // not a source outline pixel
      let mx = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const v = t.data[yy * w + xx];
          if (v > mx) mx = v;
        }
      }
      maxes.push(mx);
    }
  }
  if (!maxes.length) return { lineWhite: 255 };
  maxes.sort((a, b) => a - b);
  return { lineWhite: maxes[maxes.length >> 1] };
}
