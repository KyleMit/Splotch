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

const INK_LUMA = 150;

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

async function inkMask(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ink = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < INK_LUMA) ink[p] = 1;
  }
  return { ink, w, h };
}

// Label 4-connected components of the non-ink pixels.
function labelRegions(ink, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const regions = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (ink[start] || label[start] !== -1) continue;
    const id = regions.length;
    const reg = { id, area: 0, minX: w, minY: h, maxX: 0, maxY: 0, leftmost: start, border: false };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const p = stack[--sp];
      reg.area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < reg.minX) reg.minX = x;
      if (x > reg.maxX) reg.maxX = x;
      if (y < reg.minY) reg.minY = y;
      if (y > reg.maxY) reg.maxY = y;
      const lx = reg.leftmost % w;
      if (x < lx || (x === lx && y < ((reg.leftmost / w) | 0))) reg.leftmost = p;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) reg.border = true;
      const tryPush = (q) => {
        if (!ink[q] && label[q] === -1) {
          label[q] = id;
          stack[sp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x < w - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y < h - 1) tryPush(p + w);
    }
    regions.push(reg);
  }
  return { label, regions };
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
export async function findEyeCores(sourceBuf) {
  const { ink, w, h } = await inkMask(sourceBuf);
  const { label, regions } = labelRegions(ink, w, h);
  const page = w * h;
  const cores = [];
  for (const a of regions) {
    if (a.border || a.area < CORE_MIN_PX || a.area > page * CORE_MAX_FRAC) continue;
    const bId = parentOf(a, label, ink, w);
    if (bId < 0) continue;
    const b = regions[bId];
    if (b.border || b.area > page * PARENT_MAX_FRAC || a.area > b.area * 0.7) continue;
    if (!contains(b, a)) continue;
    const cId = parentOf(b, label, ink, w);
    if (cId < 0) continue;
    const c = regions[cId];
    if (c.border || !contains(c, b)) continue;
    cores.push(a);
  }
  return { cores, label, ink, w, h };
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
export async function scoreEyeRings(sourceBuf) {
  const { ink, w, h } = await inkMask(sourceBuf);
  const { label, regions } = labelRegions(ink, w, h);
  const page = w * h;
  let maxDepth = 0;
  let worst = null;
  const overDeep = [];
  for (const a of regions) {
    if (a.border || a.area < CORE_MIN_PX || a.area > page * CORE_MAX_FRAC) continue;
    let depth = 1;
    let cur = a;
    while (true) {
      const pId = parentOf(cur, label, ink, w);
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

function median(vals) {
  if (!vals.length) return null;
  vals.sort((x, y) => x - y);
  return vals[vals.length >> 1];
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
export async function scoreEyeFill(fillBuf, sourceBuf) {
  const { cores, label, ink, w, h } = await findEyeCores(sourceBuf);
  if (!cores.length) return { eyes: 0, cores: [] };
  const { data } = await sharp(fillBuf)
    .removeAlpha()
    .resize(w, h, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luma = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 3)
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  const measured = [];
  for (const core of cores) {
    const cx = (core.minX + core.maxX) / 2;
    const cy = (core.minY + core.maxY) / 2;
    const r = Math.max(core.maxX - core.minX, core.maxY - core.minY) / 2 + 1;

    const coreVals = [];
    for (let y = core.minY; y <= core.maxY; y++)
      for (let x = core.minX; x <= core.maxX; x++)
        if (label[y * w + x] === core.id) coreVals.push(luma[y * w + x]);

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
        if (!nearInk) bandVals.push(luma[p]);
      }
    }
    if (bandVals.length < MIN_BAND_SAMPLES) continue;

    const coreLuma = median(coreVals);
    bandVals.sort((a, b) => a - b);
    // p15/p85, not min/max or quartiles: the contrasting element can be a
    // sliver (the pupil paint around a big catchlight), but a handful of
    // stray pixels shouldn't fake one.
    const bandDark = bandVals[Math.floor(bandVals.length * 0.15)];
    const bandLight = bandVals[Math.floor(bandVals.length * 0.85)];
    const lively =
      coreLuma >= EYE_LIGHT_MIN
        ? bandDark <= EYE_DARK_MAX && coreLuma - bandDark >= EYE_CONTRAST_MIN
        : coreLuma <= EYE_DARK_MAX
          ? bandLight >= EYE_LIGHT_MIN && bandLight - coreLuma >= EYE_CONTRAST_MIN
          : false; // a mid-gray core is washed out no matter the neighbors
    measured.push({
      x: Math.round(cx),
      y: Math.round(cy),
      coreLuma,
      bandDark,
      bandLight,
      contrast: Math.max(coreLuma - bandDark, bandLight - coreLuma),
      lively,
      annulusInkFrac: annulusTotal ? annulusInk / annulusTotal : 0,
    });
  }
  return { eyes: measured.length, cores: measured };
}

// A light fill's eyes pass when at least one core on an eyed page reads lively
// (the light generator paints pupils black on white reliably; zero lively cores
// means the eyes themselves are broken, e.g. a pre-normalization outline).
export function judgeLightEyes(scored) {
  return { passes: scored.cores.length === 0 || scored.cores.some((c) => c.lively) };
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
const STRONG_LIGHT_SIDE = 180;

// A core whose annulus is mostly PEN ink is band-blind: the ink exclusion
// hides whatever surrounds it (an accident-era solid pupil around a
// catchlight), so its band stats are meaningless in both fills and can't
// gate. farm/duck-wide's side-profile eye measured 0.74 while every
// thin-stroke true failure (caterpillar/ladybug spirals) sits at 0.26-0.29.
export const BAND_BLIND_INK_FRAC = 0.5;

// On a chalk-forked page the chalk owns the eye whites, so in the simulated
// night composite every REAL eye structure has chalk-white nearby — the
// catchlight core itself or the sclera in the band reads ~255. A reference
// core with no chalk-white anywhere near it (wheel hubs, rover screens, roof
// lights — lively light-on-dark by day, legitimately dark at night) is a
// core the chalk never marked as an eye, and doesn't gate. The committed,
// human-reviewed chalk is effectively the per-page eye annotation.
export const CHALK_WHITE_MIN = 245;

export function judgeNightEyes(scoredNight, scoredLight, { chalked = false } = {}) {
  let worst = null;
  let failed = 0;
  for (let i = 0; i < scoredLight.cores.length; i++) {
    const lightCore = scoredLight.cores[i];
    const nightCore = scoredNight.cores[i];
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
