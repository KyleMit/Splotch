// Night-fill scoring shared by the dark-fill generator (coloring/gen-night-fills.mjs,
// its per-take gates) and the golden-score auditor (coloring/check-golden-scores.mjs). Extracted so
// the committed night raws can be re-scored offline with EXACTLY the generation-time
// math — the same reason lib/outline-match.mjs is shared with the light gate.
//
// Three scores, one per failure mode the night generator hits:
//   scoreDrift()     — invented white outlines far from any source line.
//   scoreNightness() — a bright/daytime background instead of a deep evening sky.
//   scoreLineColor() — the model re-inked the white outlines DARK.
import { dilateMask, erodeMask } from './morphology.mjs';
import { OUTLINE_INK_CUTOFF, OUTLINE_MASK_SIZE } from './outline-match.mjs';
import { floodBackground } from './regions.mjs';
import { luma, median } from './image-stats.mjs';
import {
  fillLumaAt,
  fillRgbAt,
  isPreparedNightAnalysis,
  prepareNightAnalysis,
  sourceLumaAt,
} from './night-analysis.mjs';

// --- Drift detection ----------------------------------------------------------
// A night fill's white pixels are outlines; the model has drifted when it draws a
// white outline where the source line art has none. We rasterize both at a working
// width, mark the source's outline pixels (dark in the black-on-white source),
// dilate that mask to absorb registration slack + the fill's glow, then count
// fill white/low-chroma pixels that fall outside it. Normalized by the source
// outline mass so pages of different line density compare on one scale.
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
export const NIGHT_BG_LUMA_MAX_DEFAULT = 60; // median background luma above this = too bright / daytime (3.1-migration bar; shipped catalog is 18-48)
const NIGHT_MIN_BG_FRAC = 0.04; // skip the check if there's barely any open background

function scaledHeight({ width, height }, targetWidth) {
  return Math.max(1, Math.round((height * targetWidth) / width));
}

async function scoreNightnessPrepared(analysis) {
  const height = scaledHeight(analysis.source, NIGHT_W);
  const [s, t] = await Promise.all([
    sourceLumaAt(analysis, NIGHT_W, height),
    fillRgbAt(analysis, NIGHT_W, height),
  ]);
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const bg = floodBackground(s.data, w, h);
  const lumas = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    const r = t.data[i * 3];
    const g = t.data[i * 3 + 1];
    const b = t.data[i * 3 + 2];
    lumas.push(luma(r, g, b));
  }
  // Too little open background to judge (e.g. a full-bleed subject): treat as fine.
  if (lumas.length < n * NIGHT_MIN_BG_FRAC) return { bgLuma: 0, bgFrac: lumas.length / n };
  return { bgLuma: median(lumas), bgFrac: lumas.length / n };
}

export async function scoreNightness(fillOrAnalysis, sourceBuf) {
  const analysis = isPreparedNightAnalysis(fillOrAnalysis)
    ? fillOrAnalysis
    : await prepareNightAnalysis(fillOrAnalysis, sourceBuf);
  return scoreNightnessPrepared(analysis);
}

function scoreDriftRasters(s, t) {
  const w = s.info.width;
  const h = s.info.height;
  const n = w * h;
  const outline = new Uint8Array(n);
  let srcCount = 0;
  for (let i = 0; i < n; i++) {
    if (s.data[i] < OUTLINE_INK_CUTOFF) {
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
    const pixelLuma = luma(r, g, b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (pixelLuma > DRIFT_LUMA_WHITE && chroma < DRIFT_CHROMA_MAX) white[i] = 1;
  }
  const blobs = dilateMask(erodeMask(white, w, h, DRIFT_THIN), w, h, DRIFT_THIN);
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (white[i] && !blobs[i] && !allowed[i]) added++; // thin white, far from a source line
  }
  return { ratio: srcCount ? added / srcCount : 0, added, srcCount };
}

async function scoreDriftPrepared(analysis) {
  const height = scaledHeight(analysis.source, OUTLINE_MASK_SIZE);
  const [s, t] = await Promise.all([
    sourceLumaAt(analysis, OUTLINE_MASK_SIZE, height),
    fillRgbAt(analysis, OUTLINE_MASK_SIZE, height),
  ]);
  return scoreDriftRasters(s, t);
}

export async function scoreDrift(fillOrAnalysis, sourceBuf) {
  if (isPreparedNightAnalysis(fillOrAnalysis)) return scoreDriftPrepared(fillOrAnalysis);
  return scoreDriftPrepared(await prepareNightAnalysis(fillOrAnalysis, sourceBuf));
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
export const LINE_WHITE_MIN_DEFAULT = 150; // median outline brightness below this = dark outlines

function scoreLineColorRasters(s, t) {
  const w = s.info.width;
  const h = s.info.height;
  const maxes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (s.data[y * w + x] >= OUTLINE_INK_CUTOFF) continue; // not a source outline pixel
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
  return { lineWhite: median(maxes) };
}

async function scoreLineColorPrepared(analysis) {
  const height = scaledHeight(analysis.source, OUTLINE_MASK_SIZE);
  const [s, t] = await Promise.all([
    sourceLumaAt(analysis, OUTLINE_MASK_SIZE, height),
    fillLumaAt(analysis, OUTLINE_MASK_SIZE, height),
  ]);
  return scoreLineColorRasters(s, t);
}

export async function scoreLineColor(fillOrAnalysis, sourceBuf) {
  if (isPreparedNightAnalysis(fillOrAnalysis)) return scoreLineColorPrepared(fillOrAnalysis);
  return scoreLineColorPrepared(await prepareNightAnalysis(fillOrAnalysis, sourceBuf));
}

export const prepareNightFillAnalysis = prepareNightAnalysis;

export async function scoreNightFillGates(fillOrAnalysis, sourceBuf) {
  const analysis = isPreparedNightAnalysis(fillOrAnalysis)
    ? fillOrAnalysis
    : await prepareNightAnalysis(fillOrAnalysis, sourceBuf);
  const [drift, night, line] = await Promise.all([
    scoreDriftPrepared(analysis),
    scoreNightnessPrepared(analysis),
    scoreLineColorPrepared(analysis),
  ]);
  return { drift, night, line };
}
