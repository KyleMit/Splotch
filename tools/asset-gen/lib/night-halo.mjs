// Score a SHIPPED night fill for a residual dark halo after the punch — the
// dirty mid-dark rim that survives around the chalk strokes when the raw fill
// re-inked its outlines dark (vehicles/train-wide's class) or painted a
// drop-shadow hugging them (objects/teddy-wide). Page-median lineWhite misses
// localized re-inking. Validated as IDEAS #7
// (ideas-exploration/idea-7). Pure, deterministic, buffers-in → scores-out — no
// API key, network, or filesystem.
//
// How it works:
//   1. rebuild the punch mask from the line art exactly like lib/punch-fill.mjs,
//   2. build a REFERENCE punch: the mask dilated by REF_DILATE, then the standard
//      neighbor bleed on the raw — the fill color from beyond any plausible rim
//      inpainted all the way in,
//   3. for pixels in 1..2-px rings around the ink, rimΔ = luma(reference) −
//      luma(shipped); haloScore = % of ring pixels with rimΔ > DELTA_RIM AND
//      shipped luma in the mid-dark penumbra window [HALO_PROTECT_BLACK,
//      HALO_DARK) — legit near-black art (an owl's eye ring) sits below the
//      window and doesn't count.
// New generator candidates gate on the normalized score. rawScore remains a
// separate crop-review signal because deliberate mid-dark art hugging lines
// (tire rings, strap shading) raises the unwindowed measure.
import sharp from 'sharp';
import { dilateMask } from './morphology.mjs';
import { bleedUnderMask, encodePunchedFill, OUTLINE_LUMA_THRESHOLD } from './punch-fill.mjs';
import { luma, quantile } from './image-stats.mjs';
import { isPreparedNightAnalysis, prepareNightAnalysis, sourceRgbAt } from './night-analysis.mjs';

export const DELTA_RIM = 40; // rimΔ above this = much darker than the true local fill
const REF_DILATE = 4; // reference punch clears any plausible rim (bands 1..3 + slack)
const MAX_BAND = 3; // hotspots count halo px out to this ring; the score uses 1..2
export const HALO_DARK = 145; // the mid-dark penumbra window: a visible halo pixel is
export const HALO_PROTECT_BLACK = 55; // luma in [55, 145) — legit near-black ink sits below
const HOTSPOT_TILE_PX = 64; // hotspot tiling grain
// Strict default for unreviewed candidates; reviewed page exceptions live in notes.json.
export const NIGHT_HALO_SCORE_MAX = 2;
// Re-inked failures start above 5; rawScore remains review-only because deliberate shading raises it.
export const NIGHT_HALO_RAW_REVIEW_THRESHOLD = 5;

async function loadRgb(buffer) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

const lumaOf = (rgb, p) => luma(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);

// The shipped punch's mask, rebuilt with lib/punch-fill.mjs's exact math.
async function punchMask(analysis, width, height) {
  const { data: line } = await sourceRgbAt(analysis, width, height);
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 3) {
    const pixelLuma = luma(line[i], line[i + 1], line[i + 2]);
    if (pixelLuma < OUTLINE_LUMA_THRESHOLD) mask[p] = 1;
  }
  return mask;
}

const haloPreparations = new WeakMap();

async function prepareHalo(analysis) {
  const existing = haloPreparations.get(analysis);
  if (existing) return existing;
  const pending = (async () => {
    const { rgb: rawRgb, width: w, height: h } = analysis.fill;
    const mask = await punchMask(analysis, w, h);
    const refMask = dilateMask(mask, w, h, REF_DILATE);
    const refRgb = Buffer.from(rawRgb);
    bleedUnderMask(refRgb, refMask, w, h);
    return { mask, refRgb, bands: ringBands(mask, w, h, MAX_BAND), w, h };
  })();
  haloPreparations.set(analysis, pending);
  try {
    return await pending;
  } catch (error) {
    haloPreparations.delete(analysis);
    throw error;
  }
}

export async function punchNightCandidate(fillOrAnalysis, lineArtBuf) {
  const analysis = isPreparedNightAnalysis(fillOrAnalysis)
    ? fillOrAnalysis
    : await prepareNightAnalysis(fillOrAnalysis, lineArtBuf);
  const { mask, w, h } = await prepareHalo(analysis);
  const punchedRgb = Buffer.from(analysis.fill.rgb);
  bleedUnderMask(punchedRgb, mask, w, h);
  return encodePunchedFill(punchedRgb, w, h);
}

function ringBands(mask, w, h, maxD) {
  const bands = [];
  let prev = mask;
  for (let d = 1; d <= maxD; d++) {
    const grown = dilateMask(prev, w, h, 1);
    const band = [];
    for (let p = 0; p < w * h; p++) if (grown[p] && !prev[p]) band.push(p);
    bands.push(band);
    prev = grown;
  }
  return bands;
}

// Core scorer: the night raw fill, the line art it was punched against (chalk if
// forked, else pen), and the shipped night fill. Returns the halo statistics; the
// caller adds page-label and lineWhite context.
/**
 * @typedef {object} HaloBandStat
 * @property {number} d
 * @property {number} n
 * @property {number} med
 * @property {number} p90
 * @property {number} p99
 * @property {number} rimShare
 * @property {number} haloShare
 */
/**
 * @typedef {object} HaloHotspot
 * @property {number} left
 * @property {number} top
 * @property {number} haloPx
 */
/**
 * @typedef {object} HaloScore
 * @property {number} w
 * @property {number} h
 * @property {number} haloScore
 * @property {number} rawScore
 * @property {number} haloPx12
 * @property {number} rimPx12
 * @property {HaloBandStat[]} bandStats
 * @property {HaloHotspot[]} hotspots
 */
/** @returns {Promise<HaloScore>} */
export async function scoreNightHalo(rawOrAnalysis, lineArtOrShipped, shippedBuf) {
  const analysis = isPreparedNightAnalysis(rawOrAnalysis)
    ? rawOrAnalysis
    : await prepareNightAnalysis(rawOrAnalysis, lineArtOrShipped);
  const shippedInput = isPreparedNightAnalysis(rawOrAnalysis) ? lineArtOrShipped : shippedBuf;
  const { rgb: shipped, width: shippedW, height: shippedH } = await loadRgb(shippedInput);
  const { refRgb, bands, w, h } = await prepareHalo(analysis);
  if (shippedW !== w || shippedH !== h)
    throw new Error(`night halo punch is ${shippedW}x${shippedH}; expected ${w}x${h}`);
  const deltaAt = (p) => lumaOf(refRgb, p) - lumaOf(shipped, p);
  const isHalo = (p) => {
    if (deltaAt(p) <= DELTA_RIM) return false;
    const l = lumaOf(shipped, p);
    return l >= HALO_PROTECT_BLACK && l < HALO_DARK;
  };

  const bandStats = bands.map((band, i) => {
    const deltas = band.map(deltaAt);
    const q = (f) => quantile(deltas, f) ?? NaN;
    return {
      d: i + 1,
      n: deltas.length,
      med: +q(0.5).toFixed(1),
      p90: +q(0.9).toFixed(1),
      p99: +q(0.99).toFixed(1),
      rimShare: deltas.filter((x) => x > DELTA_RIM).length / (deltas.length || 1),
      haloShare: band.filter(isHalo).length / (band.length || 1),
    };
  });

  // haloScore: % of band-1..2 halo pixels (rimΔ + mid-dark window).
  // rawScore: unwindowed rimΔ share, kept to show why the window matters.
  const n12 = bandStats[0].n + bandStats[1].n;
  const halo12 = bandStats[0].haloShare * bandStats[0].n + bandStats[1].haloShare * bandStats[1].n;
  const rim12 = bandStats[0].rimShare * bandStats[0].n + bandStats[1].rimShare * bandStats[1].n;
  const haloScore = +((100 * halo12) / (n12 || 1)).toFixed(3);
  const rawScore = +((100 * rim12) / (n12 || 1)).toFixed(3);

  // hotspots: tiles ranked by count of band-1..3 halo px — page-level share
  // dilutes a localized failure (train-wide's is ~6 face tiles), so an audit
  // consumer should look at both columns
  const counts = new Map();
  for (const band of bands)
    for (const p of band) {
      if (!isHalo(p)) continue;
      const col = Math.floor((p % w) / HOTSPOT_TILE_PX);
      const row = Math.floor(Math.floor(p / w) / HOTSPOT_TILE_PX);
      const k = `${col},${row}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  const hotspots = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => {
      const [col, row] = k.split(',').map(Number);
      return { left: col * HOTSPOT_TILE_PX, top: row * HOTSPOT_TILE_PX, haloPx: n };
    });

  return {
    w,
    h,
    haloScore,
    rawScore,
    haloPx12: Math.round(halo12),
    rimPx12: Math.round(rim12),
    bandStats,
    hotspots,
  };
}
