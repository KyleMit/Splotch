// Eye-fill scoring: did a colored fill actually PAINT the eyes, or did it leave
// the eye's outlined rings floating on one flat color?
//
// Since the thin-stroke outline normalization, an eye in the line art is nested
// enclosed regions (a catchlight circle inside a pupil inside the eyeball). The
// fill generators are instructed to paint them dark pupil / bright catchlight /
// light eyeball — but the model sometimes floods the whole eye one flat color,
// leaving rings that never read as an eye (the nature/bee-wide night fill
// shipped that way: navy eyeball, navy pupil, navy catchlight). None of the
// other gates can see this: outlines register perfectly and the background is
// properly dark.
//
// The check is anatomy-AGNOSTIC because outline eye anatomy varies (the
// catchlight ring may be nested inside the pupil ring, or tangent to it, and
// hairline ring gaps merge regions unpredictably): find each eye's INNERMOST
// enclosed region — a small region at nesting depth >= 2, e.g. a catchlight
// interior or a pupil disc — and require strong dark-vs-light contrast between
// it and the band of fill immediately around it. A lively eye contrasts in one
// direction or the other (light catchlight on dark pupil, or dark pupil on
// light sclera); a flat-flooded eye contrasts in neither. Pages with no
// detected eye core aren't gated.
import sharp from 'sharp';
import { prepareOutlineAnalysis, prepareOutlineRegions } from './outline-analysis.mjs';
import { luma, quantile } from './image-stats.mjs';
import { annotatedLightEyeCores } from './light-eye-annotations.mjs';
import { scoreSolidity } from './solid-regions.mjs';

// Pass bars, shared by the generation gates and the raw-fill auditor: of the
// eye core and its surrounding band, the lighter side must be genuinely light,
// the darker side genuinely dark, and the gap wide. Calibrated on the nature
// raws: good eyes read 230-255 vs 1-70; the flat-flooded failures read 26-37 on
// BOTH sides.
export const EYE_LIGHT_MIN = 150;
export const EYE_DARK_MAX = 100;
export const EYE_CONTRAST_MIN = 60;

// Size bands for an eye core (fractions of the page area).
const CORE_MIN_PX = 6;
const CORE_MAX_FRAC = 0.005;
const PARENT_MAX_FRAC = 0.05;
const MIN_BAND_SAMPLES = 8;
const SOLID_CORE_PROBE_PX = 2;

async function analyzeEyePage(source) {
  return prepareOutlineRegions(await prepareOutlineAnalysis(source));
}

// The region enclosing `reg`: march left from its leftmost pixel across the ink
// ring; the first non-ink pixel belongs to the enclosing region (for the closed
// loops an eye is made of).
function parentOf(reg, label, ink, w) {
  let p = reg.leftmost;
  let x = p % w;
  while (x > 0) {
    p--;
    x--;
    if (!ink[p]) return label[p];
  }
  return -1;
}

function parentFromAnalysis(reg, analysis) {
  let parent = analysis.parents[reg.id];
  if (parent !== -2) return parent;
  parent = parentOf(reg, analysis.label, analysis.ink, analysis.w);
  analysis.parents[reg.id] = parent;
  return parent;
}

const contains = (outer, inner, slack = 2) =>
  outer.minX <= inner.minX + slack &&
  outer.minY <= inner.minY + slack &&
  outer.maxX >= inner.maxX - slack &&
  outer.maxY >= inner.maxY - slack;

// Eye-core regions: the innermost region A of a nested (A ⊂ B ⊂ C) chain in
// eye-like size bands — a catchlight interior or a small pupil disc. The strict
// double-nesting with bbox containment is what keeps this precise: a loose
// "childless region at depth 2" filter also matches blanket checks and leaf
// cells, whose flat fill is legitimate, and drowns the real eyes.
function findEyeCoresFromAnalysis(analysis) {
  const { ink, label, regions, w, h } = analysis;
  const page = w * h;
  const cores = [];
  for (const a of regions) {
    if (a.border || a.area < CORE_MIN_PX || a.area > page * CORE_MAX_FRAC) continue;
    const bId = parentFromAnalysis(a, analysis);
    if (bId < 0) continue;
    const b = regions[bId];
    if (b.border || b.area > page * PARENT_MAX_FRAC || a.area > b.area * 0.7) continue;
    if (!contains(b, a)) continue;
    const cId = parentFromAnalysis(b, analysis);
    if (cId < 0) continue;
    const c = regions[cId];
    if (c.border || !contains(c, b)) continue;
    cores.push(a);
  }
  return { cores, label, ink, w, h };
}

export async function findEyeCores(sourceBuf) {
  return findEyeCoresFromAnalysis(await analyzeEyePage(sourceBuf));
}

// Deeper nesting than a normal eye means the outline grew extra concentric
// circles — the "hypno swirl" failure a normalization redraw produced on
// caterpillar-tall. Registration can't catch it (extra rings hug the old pupil
// boundary) and solidity can't either (everything is thin), so ring depth is
// its own outline gate. Measured anatomy on the approved nature set: a normal
// eye chains 3-4 eye-scale levels (catchlight → pupil → sclera, sometimes one
// more enclosing eye-scale region); the swirl-eyed caterpillar measured 5.
export const EYE_RING_DEPTH_MAX = 4;

// Deepest eye-scale nesting chain in a line art, walking each eye core's
// parent chain upward until the enclosing region stops being eye-sized.
// Returns { maxDepth, worst: {x, y, depth}, overDeep: [{depth, outer bbox}] }
// — maxDepth 0 means no eye cores; overDeep lists the outermost eye-scale
// region of every chain past the bar, so a normalization redraw can treat that
// whole eye interior as replaceable.
function scoreEyeRingsFromAnalysis(analysis) {
  const { regions, w, h } = analysis;
  const page = w * h;
  let maxDepth = 0;
  let worst = null;
  const overDeep = [];
  for (const a of regions) {
    if (a.border || a.area < CORE_MIN_PX || a.area > page * CORE_MAX_FRAC) continue;
    let depth = 1;
    let cur = a;
    while (true) {
      const pId = parentFromAnalysis(cur, analysis);
      if (pId < 0) break;
      const p = regions[pId];
      if (p.border || p.area > page * PARENT_MAX_FRAC || !contains(p, cur)) break;
      depth++;
      cur = p;
    }
    if (depth < 3) continue; // not an eye-like chain at all
    if (depth > EYE_RING_DEPTH_MAX)
      overDeep.push({
        depth,
        outer: { minX: cur.minX, minY: cur.minY, maxX: cur.maxX, maxY: cur.maxY },
      });
    if (depth > maxDepth) {
      maxDepth = depth;
      worst = { x: Math.round((a.minX + a.maxX) / 2), y: Math.round((a.minY + a.maxY) / 2), depth };
    }
  }
  return { maxDepth, worst, overDeep, passes: maxDepth <= EYE_RING_DEPTH_MAX };
}

export async function scoreEyeRings(sourceBuf) {
  return scoreEyeRingsFromAnalysis(await analyzeEyePage(sourceBuf));
}

export async function scoreEyes(sourceBuf) {
  const analysis = await analyzeEyePage(sourceBuf);
  return {
    cores: findEyeCoresFromAnalysis(analysis),
    rings: scoreEyeRingsFromAnalysis(analysis),
  };
}

function median(vals) {
  if (!vals.length) return null;
  return quantile(vals, 0.5);
}

function coreLuma(lumas, w, core, label) {
  const coreVals = [];
  for (let y = core.minY; y <= core.maxY; y++)
    for (let x = core.minX; x <= core.maxX; x++)
      if (label[y * w + x] === core.id) coreVals.push(lumas[y * w + x]);
  return median(coreVals);
}

function sourceSolidAroundCore(solid, w, h, core) {
  for (
    let y = Math.max(0, core.minY - SOLID_CORE_PROBE_PX);
    y <= Math.min(h - 1, core.maxY + SOLID_CORE_PROBE_PX);
    y++
  )
    for (
      let x = Math.max(0, core.minX - SOLID_CORE_PROBE_PX);
      x <= Math.min(w - 1, core.maxX + SOLID_CORE_PROBE_PX);
      x++
    )
      if (solid[y * w + x]) return true;
  return false;
}

function sampleAnnulus(lumas, ink, label, w, h, core, cx, cy, r) {
  // Neighborhood: a TIGHT geometric annulus just outside the core's ring —
  // wide enough to cross a double-stroked ring into the next region, narrow
  // enough that features beyond the eye (a lit cheek, the dark face) barely
  // register. Flood- and label-based variants each failed a real page: label
  // marches tunnel past tangent rings (bee-tall), sealed floods starve
  // behind double-stroked rings (spider), leaky floods drown the sclera in
  // face pixels (spider again), and wide annuli sample the cheek
  // (caterpillar). Geometry with a tight cap is the only definition that
  // held up. Samples keep 1px of ink clearance — enough to skip line
  // antialiasing while still reaching the thin slivers of pupil paint
  // around a large catchlight.
  const rIn = r + 3;
  const rOut = r + 3 + Math.max(12, r * 0.6);
  const bandVals = [];
  let annulusTotal = 0;
  let annulusInk = 0;
  for (
    let y = Math.max(0, Math.floor(cy - rOut));
    y <= Math.min(h - 1, Math.ceil(cy + rOut));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(cx - rOut));
      x <= Math.min(w - 1, Math.ceil(cx + rOut));
      x++
    ) {
      const p = y * w + x;
      if (label[p] === core.id) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < rIn || d > rOut) continue;
      annulusTotal++;
      if (ink[p]) {
        annulusInk++;
        continue;
      }
      let nearInk = false;
      for (let dy = -1; dy <= 1 && !nearInk; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h || ink[yy * w + xx]) {
            nearInk = true;
            break;
          }
        }
      }
      if (!nearInk) bandVals.push(lumas[p]);
    }
  }
  return { bandVals, annulusInkFrac: annulusTotal ? annulusInk / annulusTotal : 0 };
}

function judgeLively(coreLuma, bandDark, bandLight) {
  return coreLuma >= EYE_LIGHT_MIN
    ? bandDark <= EYE_DARK_MAX && coreLuma - bandDark >= EYE_CONTRAST_MIN
    : coreLuma <= EYE_DARK_MAX
      ? bandLight >= EYE_LIGHT_MIN && bandLight - coreLuma >= EYE_CONTRAST_MIN
      : false; // a mid-gray core is washed out no matter the neighbors
}

// Measure a fill at every eye core of its source line art. Returns one entry
// per measurable core: its median luma, its neighborhood's dark/light
// quartiles, and whether the core reads as part of a LIVELY eye.
//
// Lively is judged by neighborhood EXTREMES, not the neighborhood median: a
// light core (a painted catchlight) needs something genuinely dark close by
// (the pupil — the annulus's 25th percentile), a dark core (a pupil disc)
// needs something genuinely light close by (the sclera — the 75th). Medians
// mislead here because the annulus legitimately mixes pupil, sclera, and face
// in outline-dependent proportions (bee-tall's small pupils made its perfect
// eyes read "flat" on a median). Only an eye whose WHOLE neighborhood is one
// flat color — the shipped bee-wide night failure — fails both extremes.
//
// Which cores are REAL eyes (vs a ladybug's shell spots or a caterpillar's
// segment dots, which nest the same way but are legitimately flat) is decided
// by cross-referencing fills, not by anatomy — see judgeNightEyes.
/**
 * @typedef {object} EyeCoreScore
 * @property {number} regionId
 * @property {number} x
 * @property {number} y
 * @property {number} coreLuma
 * @property {number} bandDark
 * @property {number} bandLight
 * @property {number} contrast
 * @property {boolean} lively
 * @property {number} annulusInkFrac
 * @property {boolean} sourceSolid
 */
/**
 * @typedef {object} EyeFillScore
 * @property {number} eyes
 * @property {EyeCoreScore[]} cores
 */
/** @returns {Promise<EyeFillScore>} */
export async function scoreEyeFill(fillBuf, sourceBuf) {
  const analysis = await analyzeEyePage(sourceBuf);
  const { cores, label, ink, w, h } = findEyeCoresFromAnalysis(analysis);
  if (!cores.length) return { eyes: 0, cores: [] };
  const {
    masks: { solid },
  } = await scoreSolidity(analysis);
  const { data } = await sharp(fillBuf)
    .removeAlpha()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lumas = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) lumas[p] = luma(data[i], data[i + 1], data[i + 2]);

  const measured = [];
  for (const core of cores) {
    const cx = (core.minX + core.maxX) / 2;
    const cy = (core.minY + core.maxY) / 2;
    const r = Math.max(core.maxX - core.minX, core.maxY - core.minY) / 2 + 1;

    const measuredCoreLuma = coreLuma(lumas, w, core, label);
    const { bandVals, annulusInkFrac } = sampleAnnulus(lumas, ink, label, w, h, core, cx, cy, r);
    if (bandVals.length < MIN_BAND_SAMPLES) continue;

    // p15/p85, not min/max or quartiles: the contrasting element can be a
    // sliver (the pupil paint around a big catchlight), but a handful of
    // stray pixels shouldn't fake one.
    const bandDark = quantile(bandVals, 0.15);
    const bandLight = quantile(bandVals, 0.85);
    const lively = judgeLively(measuredCoreLuma, bandDark, bandLight);
    measured.push({
      regionId: core.id,
      x: Math.round(cx),
      y: Math.round(cy),
      coreLuma: measuredCoreLuma,
      bandDark,
      bandLight,
      contrast: Math.max(measuredCoreLuma - bandDark, bandLight - measuredCoreLuma),
      lively,
      annulusInkFrac,
      sourceSolid: sourceSolidAroundCore(solid, w, h, core),
    });
  }
  return { eyes: measured.length, cores: measured };
}

// A night fill's eyes pass when EVERY eye structure the light fill paints
// strongly also reads lively in the night fill — core by core. The light fill
// is the reference for which cores are real eyes: shell spots and segment dots
// are flat (or weakly lit, below STRONG_LIGHT_SIDE) in light and never gate.
//
// Enforcement was briefly per-eye-any-core ("one lively core keeps the eye
// alive") and that shipped a ladybug whose white catchlight sat on a dead navy
// sclera — the catchlight carried the verdict while the eye read as a dark
// socket. Every strong structure must survive: the catchlight stays bright ON
// a dark pupil AND the pupil stays dark ON a light sclera.
export const STRONG_LIGHT_SIDE = 180;

// A core whose annulus is mostly PEN ink is band-blind: the ink exclusion
// hides whatever surrounds it (an accident-era solid pupil around a
// catchlight), so its band stats are meaningless in both fills and can't
// gate. farm/duck-wide's side-profile eye measured 0.74 while every
// thin-stroke true failure (caterpillar/ladybug spirals) sits at 0.26-0.29.
export const BAND_BLIND_INK_FRAC = 0.5;

// A light fill's eyes are gated when at least one blessed eye core has a
// measurable surrounding band. A source-solid pupil is owned by the pen overlay
// in the final light composite, so requiring the raw fill to paint outside that
// footprint makes the visible pupil larger. Nested windows and hubs are excluded
// by the reviewed per-page annotations rather than treated as anatomy.
export function judgeLightEyes(scored, { page } = {}) {
  const eyeCores = annotatedLightEyeCores(page, scored.cores);
  const measurable = eyeCores.filter(
    (core) => !core.sourceSolid && core.annulusInkFrac <= BAND_BLIND_INK_FRAC
  );
  const gated = measurable.length > 0;
  return { passes: !gated || eyeCores.some((core) => core.lively), gated };
}

// On a chalk-forked page the chalk owns the eye whites, so in the simulated
// night composite every REAL eye structure has chalk-white nearby — the
// catchlight core itself or the sclera in the band reads ~255. A reference
// core with no chalk-white anywhere near it (wheel hubs, rover screens, roof
// lights — lively light-on-dark by day, legitimately dark at night) is a
// core the chalk never marked as an eye, and doesn't gate. The committed,
// human-reviewed chalk is effectively the per-page eye annotation.
const CHALK_WHITE_MIN = 245;

// Both scores come from independent scoreEyeFill runs over the SAME source line
// art, so a core's source region id identifies it on both sides — and unlike its
// rounded center, two cores can't share one: a concentric catchlight inside a
// pupil disc (or a hypno-swirl ring stack) rounds to the same x,y but is a
// distinct labeled region. Pairing positionally would be a silent mispairing the
// moment scoreEyeFill grew a skip that depends on the fill.
function nightCoresByRegion(scoredNight) {
  const byRegion = new Map(scoredNight.cores.map((core) => [core.regionId, core]));
  if (byRegion.size !== scoredNight.cores.length)
    throw new Error('judgeNightEyes: night eye cores share a region id — cannot pair them');
  return byRegion;
}

export function judgeNightEyes(scoredNight, scoredLight, { chalked = false } = {}) {
  let worst = null;
  let failed = 0;
  const nightByRegion = nightCoresByRegion(scoredNight);
  for (const lightCore of scoredLight.cores) {
    const nightCore = nightByRegion.get(lightCore.regionId);
    const isReference =
      lightCore.lively && Math.max(lightCore.coreLuma, lightCore.bandLight) >= STRONG_LIGHT_SIDE;
    if (!isReference || !nightCore || nightCore.lively) continue;
    if (lightCore.annulusInkFrac > BAND_BLIND_INK_FRAC) continue;
    if (chalked && Math.max(nightCore.coreLuma, nightCore.bandLight) < CHALK_WHITE_MIN) continue;
    failed++;
    if (!worst || nightCore.contrast < worst.contrast) worst = nightCore;
  }
  return { passes: failed === 0, failed, worst };
}
