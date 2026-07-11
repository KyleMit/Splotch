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

    // Neighborhood: flood outward from just past the core's ring, capped to a
    // small radius, traversing ONLY pixels ≥2px clear of any ink. Connectivity
    // through clear pixels is what keeps the sample inside the eye: the
    // eyeball ring's ink contains the flood even where the ring has a hairline
    // gap (a gap narrower than ~2×clearance has no clear channel), so a lit
    // face right outside the eye can't masquerade as a lit sclera — a plain
    // annulus passed the caterpillar's dead navy eyes exactly that way. The
    // clearance doubles as the antialiasing guard for the sampled values.
    const rIn = r + 3;
    const rOut = r * 2.2 + 6;
    const clear = (p) => {
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h || ink[yy * w + xx]) return false;
        }
      }
      return true;
    };
    const bandVals = [];
    {
      const seen = new Set();
      const queue = [];
      const seedR = Math.ceil(rIn + 3);
      for (let y = Math.max(0, Math.floor(cy - seedR)); y <= Math.min(h - 1, cy + seedR); y++) {
        for (let x = Math.max(0, Math.floor(cx - seedR)); x <= Math.min(w - 1, cx + seedR); x++) {
          const p = y * w + x;
          if (ink[p] || label[p] === core.id || seen.has(p) || !clear(p)) continue;
          seen.add(p);
          queue.push(p);
        }
      }
      for (let qi = 0; qi < queue.length; qi++) {
        const p = queue[qi];
        const x = p % w;
        const y = (p / w) | 0;
        const d = Math.hypot(x - cx, y - cy);
        if (d > rOut) continue;
        if (d >= rIn) bandVals.push(luma[p]);
        const tryPush = (q) => {
          if (!ink[q] && label[q] !== core.id && !seen.has(q) && clear(q)) {
            seen.add(q);
            queue.push(q);
          }
        };
        if (x > 0) tryPush(p - 1);
        if (x < w - 1) tryPush(p + 1);
        if (y > 0) tryPush(p - w);
        if (y < h - 1) tryPush(p + w);
      }
    }
    if (bandVals.length < MIN_BAND_SAMPLES) continue;

    const coreLuma = median(coreVals);
    bandVals.sort((a, b) => a - b);
    // Quartiles, not extremes: the flood is region-targeted so a real
    // contrasting element (a sclera crescent, a pupil sliver) is a meaningful
    // share of the samples, and a few pixels leaked through a hairline ring
    // gap can't fake one.
    const bandDark = bandVals[Math.floor(bandVals.length * 0.25)];
    const bandLight = bandVals[Math.floor(bandVals.length * 0.75)];
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

// A night fill's eyes pass when every EYE that the light fill paints strongly
// also shows life in the night fill. The light fill is the reference for which
// cores are real eyes: shell spots and segment dots are flat (or weakly lit)
// in light and never gate.
//
// Enforcement is per EYE, not per core: an eye is a proximity cluster of cores
// (a pupil disc plus one or two catchlight circles land within a few dozen px
// of each other), and it passes if ANY of its cores reads lively at night. A
// night eye with a crisp dark-pupil-on-light-sclera but a navy-flooded
// catchlight interior still reads alive; only an eye with NO contrast anywhere
// — the shipped bee-wide failure — is dead. The reference bar is stricter than
// plain lively (light side >= STRONG_LIGHT_SIDE) so a marginal dark-dot-on-red
// shell spot doesn't get enforced as an eye and then legitimately dim at night.
// Same-eye cores (a pupil disc and its catchlights) sit within ~15px of each
// other; the nearest DIFFERENT feature observed is ~52px away (caterpillar's
// right eye vs its nose highlight — merging those let a dead eye borrow the
// nose's liveliness). 35 splits the difference.
const CLUSTER_DIST = 35;
const STRONG_LIGHT_SIDE = 180;

export function judgeNightEyes(scoredNight, scoredLight) {
  const n = scoredLight.cores.length;
  const parent = [...Array(n).keys()];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = scoredLight.cores[i];
      const b = scoredLight.cores[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= CLUSTER_DIST) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  }
  let worst = null;
  let failed = 0;
  for (const idxs of groups.values()) {
    const isReferenceEye = idxs.some((i) => {
      const c = scoredLight.cores[i];
      return c.lively && Math.max(c.coreLuma, c.bandLight) >= STRONG_LIGHT_SIDE;
    });
    if (!isReferenceEye) continue;
    if (idxs.some((i) => scoredNight.cores[i]?.lively)) continue;
    failed++;
    const c = scoredNight.cores[idxs[0]];
    if (c && (!worst || c.contrast < worst.contrast)) worst = c;
  }
  return { passes: failed === 0, failed, worst };
}
