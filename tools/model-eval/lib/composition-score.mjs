// Composition-adherence scoring: how faithfully a generated illustration keeps
// the layout of the child's drawing it was made from.
//
// Pixel-diffing input against output is meaningless here — a good generation
// restyles every pixel. What must survive is the *composition*: each drawn
// element staying at its position and scale within the frame. So the scorer
// measures structure, not pixels, two independent ways:
//
//  1. GLOBAL: the input's ink edges are chamfer-matched against the output's
//     edge map, once at the identity transform and once at the best-fitting
//     similarity transform (scale about the ink centroid + translation).
//     Chamfer is normalized by the output's chance level — the mean
//     distance-to-edge over the whole frame — because a busy, detail-rich
//     output puts an edge near *any* point and would otherwise get a free
//     pass. A faithful output has a low ratio at identity; an output that
//     enlarged or recentered the design scores badly at identity but well at
//     some other transform — and that transform (bestScale, bestOffset) names
//     the drift.
//
//  2. PER ELEMENT: input ink is clustered by palette color into elements (the
//     sun, the boat, the ground line), each output is searched for the
//     color-matching region, and centroid shift + linear scale factor are
//     reported per element. This survives restyling (a tuned red is still
//     nearest red) and is the diagnostic half: "the boat grew 1.9× and moved
//     to center" rather than one opaque number. Broad scribble washes (water,
//     sky, ground) are classed apart from compact subjects: flooding a wash to
//     the frame edge is legitimate artistic license, while moving or resizing
//     a compact subject is exactly the failure being measured.
//
// Both run on a small working grid; everything is plain math on raw pixels.

import sharp from 'sharp';
import { PALETTE } from './model-eval.mjs';

// Long side of the working grid. Composition lives at poster scale — enough to
// localize a centroid within a couple percent, far below generation noise.
const GRID_LONG_SIDE_PX = 160;

// A pixel is ink when it sits at least this far (RGB euclidean) from the paper
// color; the fixture corpus is flat-rendered, so the gap is wide.
const INK_DISTANCE_MIN = 40;

// Sobel magnitude at or above this marks an output edge pixel (per-channel 0-255).
const EDGE_MAGNITUDE_MIN = 48;

// Similarity-transform search bounds: scales are log-spaced, offsets are
// fractions of the frame. Wide enough to catch a design doubled in size or
// pushed a third of the frame over — anything past that reads as a redesign,
// which the identity ratio already scores as such.
const SCALE_SEARCH_MIN = 0.5;
const SCALE_SEARCH_MAX = 2.1;
const SCALE_SEARCH_STEPS = 16;
const OFFSET_SEARCH_MAX_FRACTION = 0.32;
const OFFSET_SEARCH_STEP_FRACTION = 0.04;

// One-sided chamfer has a degenerate minimum: collapse every point into the
// busiest region. The search pays this much (in chamfer-% units) per log2 of
// scale change and per diagonal-fraction of offset, so a non-identity best fit
// must earn its keep — it exists to *name* a real drift, not to hunt one.
const TRANSFORM_DRIFT_REGULARIZER_PCT = 0.35;

// Cap on sampled input edge points; beyond this the chamfer mean is stable.
const MAX_EDGE_POINTS = 1600;

// Element extraction: an input color cluster below this share of the frame is
// noise (antialiasing slivers). An input element whose ink spans most of the
// frame's width, or a large share of its area, is a wash rather than a compact
// subject.
const ELEMENT_MIN_AREA_FRACTION = 0.002;
const WASH_MIN_SPAN_FRACTION = 0.7;
const WASH_MIN_AREA_FRACTION = 0.1;

// A color cluster whose ink fills this much of its own bounding box was
// scribbled in as a REGION rather than drawn as lines. The child coloured an
// area, and what the finished picture owes them is that area rendered as the
// one filled thing it depicts — water, sky, grass — not their individual
// strokes preserved on top of it. Below this density the cluster is line work
// (an outline, a wave, a stick figure) where stroke placement is the point.
const FILL_INK_DENSITY_MIN = 0.28;
// …and it has to occupy a real area before "region" means anything.
const FILL_MIN_AREA_FRACTION = 0.01;
// Closing radius, as a fraction of the grid's long side, that merges the gaps
// between back-and-forth scribble strokes into the solid region they mean.
const FILL_CLOSE_RADIUS_FRACTION = 0.04;
// Neighbouring elements (the boat floating in the water) are lifted out of the
// region before it is scored, so a subject sitting inside a fill cannot read as
// a hole in it.
const FILL_NEIGHBOUR_MARGIN_FRACTION = 0.015;
// Lab distance below which two elements are the same ink seen through
// antialiasing rather than two things the child drew.
const NEIGHBOUR_DISTINCT_DELTA_E = 30;
// A region this much covered by the element's colour counts as fully coloured
// in; models leave soft edges and highlights, and chasing the last few percent
// would score gloss rather than intent.
const FILL_COVERAGE_TARGET = 0.8;
// Fill colour is matched by HUE, not by Lab distance. A painted sea is the same
// blue the child chose at a fraction of its chroma and twice its lightness —
// ΔE reads that as a different colour entirely (measured: median ΔE 69 against
// palette blue for a watercolour sea that is unmistakably the child's water),
// which would score "you changed the shade" as "you never filled it in". Hue
// separates the cases the coverage term exists to separate: a pale blue sea
// still points at blue, a cream sky does not.
const FILL_HUE_TOLERANCE_DEG = 38;
// Below this chroma a pixel has no meaningful hue — it is paper, white, or a
// grey — so it cannot count as the region having been coloured in.
const FILL_MIN_CHROMA = 7;
// An element colour this achromatic (the black crayon) has no hue to compare
// against either, so its coverage falls back to plain Lab distance.
const FILL_ACHROMATIC_ELEMENT_CHROMA = 15;
const FILL_COLOR_MATCH_DELTA_E = 34;
// How much of the closed region is gaps between the strokes that made it. A
// shape the child filled in solid closes to itself and has none; a
// back-and-forth scribble always leaves paper showing between passes. This is
// what separates "coloured this area in" from "drew this object", and only the
// first is scored on coverage rather than on placement.
const FILL_STROKE_GAP_MIN = 0.12;
// Coverage asks whether the region came back coloured. On its own it cannot see
// colour that arrived where the child never put any: flooding the whole frame
// with the fill's hue covers the region perfectly, and because fill zones are
// also held out of the global chamfer, nothing else was charging for it — a
// bounded band and a full-frame flood both measured 99. Containment closes that
// hole by counting the fill's own colour OUTSIDE its region, in units of the
// region's own area, so a subject the child filled in cannot grow across the
// canvas for free. The tolerance is one region's worth of the fill's paint
// appearing elsewhere: a soft edge or a halo costs almost nothing, a second area
// the size of the one the child coloured costs most of the term, and a flooded
// frame zeroes it.
const FILL_SPILL_TOLERANCE = 1;
// Soft edges, ripples, and antialiasing put a little of the colour just past the
// child's own strokes. A margin this wide is finishing, not spill.
const FILL_SPILL_MARGIN_FRACTION = 0.05;
// Spill is matched against the paint the output actually used inside the region,
// not against the palette colour, and by Lab distance rather than by hue. The
// loose hue match that makes coverage work — a pale sea is still the child's
// blue — would otherwise read a pale sky as the sea flooding the frame. What
// spill means is the same paint appearing outside the lines.
const FILL_SPILL_MATCH_DELTA_E = 20;
// How closely the output still draws along the child's own scribble strokes,
// as a chamfer ratio against the region's chance level — the same normalization
// the global term uses, so a region full of unrelated texture cannot read as
// preserved strokes. Near 0 means the strokes are still there stroke for
// stroke, which is the cheat this term exists to catch: paint the sea
// underneath, redraw the squiggles on top, and every edge still lines up.
// Near 1 means the output's edges have nothing to do with where the child's
// passes fell, which is what colouring the area in looks like.
const FILL_STROKE_ECHO_TOLERANCE = 0.5;

// An output color-mask component owning at least this share of the frame
// border is a background wash (a sky or field that adopted the element's hue),
// not the element itself.
const BACKGROUND_BORDER_CONTACT_FRACTION = 0.22;

// Lab distance for "this pixel belongs to that element's color". The input is
// exact palette color; the output threshold is generous because models retune
// hues while keeping identity (a tomato boat is still the red element).
const INPUT_COLOR_MATCH_DELTA_E = 22;
const OUTPUT_COLOR_MATCH_DELTA_E = 26;

// Below this chance level (mean distance-to-edge as % of the frame diagonal)
// the output's edge map is saturated — noise or wall-to-wall texture puts an
// edge at nearly every pixel, so "the input's edges land on output edges" is
// true of ANY point set and the global match measures nothing. The floor sits
// in the measured gap: the densest real output in the reference corpus (a
// coloring page's line art) measures ~0.23%, while RGB noise measures ~0.01%.
const MIN_INFORMATIVE_CHANCE_PCT = 0.1;

// What the global term scores when the edge map is saturated: poor — the same
// as a lost element, not perfect — so a texture-flooded output cannot outrank
// a faithful one on the strength of a meaningless match.
const SATURATED_EDGE_MAP_VALUE = 0.2;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// --- color space -------------------------------------------------------------

function srgbToLab(r, g, b) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const labDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// --- raster loading ----------------------------------------------------------

async function loadGrid(bytes, width, height) {
  const raw = await sharp(bytes)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  return { data: raw, width, height };
}

export function gridSizeFor(inputWidth, inputHeight) {
  const aspect = inputWidth / inputHeight;
  return aspect >= 1
    ? { width: GRID_LONG_SIDE_PX, height: Math.max(8, Math.round(GRID_LONG_SIDE_PX / aspect)) }
    : { width: Math.max(8, Math.round(GRID_LONG_SIDE_PX * aspect)), height: GRID_LONG_SIDE_PX };
}

// The paper color is whatever dominates the frame border — true for both light
// and night paper, and independent of design-token drift.
export function estimatePaperColor({ data, width, height }) {
  const counts = new Map();
  const record = (x, y) => {
    const i = (y * width + x) * 3;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const entry = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    entry.n++;
    entry.r += data[i];
    entry.g += data[i + 1];
    entry.b += data[i + 2];
    counts.set(key, entry);
  };
  for (let x = 0; x < width; x++) {
    record(x, 0);
    record(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    record(0, y);
    record(width - 1, y);
  }
  let best = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

export function inkMask({ data, width, height }, paper) {
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 3) {
    const d = Math.hypot(data[i] - paper[0], data[i + 1] - paper[1], data[i + 2] - paper[2]);
    if (d >= INK_DISTANCE_MIN) mask[p] = 1;
  }
  return mask;
}

// Boundary pixels of the ink mask — the stroke outlines, which are what a
// clean restyled output still draws edges along.
export function maskEdgePoints(mask, width, height) {
  const points = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!mask[p]) continue;
      const boundary =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !mask[p - 1] ||
        !mask[p + 1] ||
        !mask[p - width] ||
        !mask[p + width];
      if (boundary) points.push([x, y]);
    }
  }
  if (points.length <= MAX_EDGE_POINTS) return points;
  const stride = points.length / MAX_EDGE_POINTS;
  const sampled = [];
  for (let i = 0; i < points.length; i += stride) sampled.push(points[Math.floor(i)]);
  return sampled;
}

// Per-channel Sobel, keeping the strongest channel's magnitude: a pale-yellow
// sun on a pale-blue sky is nearly invisible in luminance but loud in the red
// and blue channels, and a luminance-only map losing it charged a faithful
// output for edges it did draw.
export function sobelEdgeMap({ data, width, height }) {
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      let strongest = 0;
      for (let c = 0; c < 3; c++) {
        const at = (q) => data[q * 3 + c];
        const gx =
          -at(p - width - 1) -
          2 * at(p - 1) -
          at(p + width - 1) +
          at(p - width + 1) +
          2 * at(p + 1) +
          at(p + width + 1);
        const gy =
          -at(p - width - 1) -
          2 * at(p - width) -
          at(p - width + 1) +
          at(p + width - 1) +
          2 * at(p + width) +
          at(p + width + 1);
        const magnitude = Math.hypot(gx, gy);
        if (magnitude > strongest) strongest = magnitude;
      }
      if (strongest >= EDGE_MAGNITUDE_MIN) edges[p] = 1;
    }
  }
  return edges;
}

// Two-pass 3-4 chamfer distance transform, in grid pixels.
export function distanceTransform(edges, width, height) {
  const INF = 1e9;
  const dist = new Float32Array(width * height);
  for (let p = 0; p < dist.length; p++) dist[p] = edges[p] ? 0 : INF;
  const relax = (p, q, cost) => {
    if (dist[q] + cost < dist[p]) dist[p] = dist[q] + cost;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (x > 0) relax(p, p - 1, 3);
      if (y > 0) relax(p, p - width, 3);
      if (x > 0 && y > 0) relax(p, p - width - 1, 4);
      if (x < width - 1 && y > 0) relax(p, p - width + 1, 4);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (x < width - 1) relax(p, p + 1, 3);
      if (y < height - 1) relax(p, p + width, 3);
      if (x < width - 1 && y < height - 1) relax(p, p + width + 1, 4);
      if (x > 0 && y < height - 1) relax(p, p + width - 1, 4);
    }
  }
  for (let p = 0; p < dist.length; p++) dist[p] = dist[p] / 3;
  return dist;
}

function meanChamfer(points, dist, width, height, scale, cx, cy, dx, dy) {
  const diagonal = Math.hypot(width, height);
  const offBoard = diagonal / 4;
  let total = 0;
  for (const [x, y] of points) {
    const tx = Math.round(cx + (x - cx) * scale + dx);
    const ty = Math.round(cy + (y - cy) * scale + dy);
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) total += offBoard;
    else total += dist[ty * width + tx];
  }
  return (total / points.length / diagonal) * 100;
}

// Chamfer at identity plus a coarse-grid search over scale-about-ink-centroid
// and translation, both normalized by the frame's chance level (mean
// distance-to-edge everywhere). `identityRatio` is the metric;
// `bestScale`/`bestOffset` are the drift diagnostics.
function globalAlignment(points, dist, width, height) {
  if (!points.length) return null;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;

  const diagonal = Math.hypot(width, height);
  let chance = 0;
  for (let p = 0; p < dist.length; p++) chance += dist[p];
  const chanceChamferPct = (chance / dist.length / diagonal) * 100;

  const identityChamferPct = meanChamfer(points, dist, width, height, 1, cx, cy, 0, 0);

  const scales = [];
  for (let i = 0; i < SCALE_SEARCH_STEPS; i++) {
    const t = i / (SCALE_SEARCH_STEPS - 1);
    scales.push(SCALE_SEARCH_MIN * (SCALE_SEARCH_MAX / SCALE_SEARCH_MIN) ** t);
  }
  const maxOffset = OFFSET_SEARCH_MAX_FRACTION * diagonal;
  const step = OFFSET_SEARCH_STEP_FRACTION * diagonal;

  let best = { chamferPct: identityChamferPct, scale: 1, dx: 0, dy: 0 };
  let bestCost = identityChamferPct;
  for (const scale of scales) {
    for (let dy = -maxOffset; dy <= maxOffset; dy += step) {
      for (let dx = -maxOffset; dx <= maxOffset; dx += step) {
        const chamferPct = meanChamfer(points, dist, width, height, scale, cx, cy, dx, dy);
        const drift = Math.abs(Math.log2(scale)) + Math.hypot(dx, dy) / diagonal;
        const cost = chamferPct + TRANSFORM_DRIFT_REGULARIZER_PCT * drift;
        if (cost < bestCost) {
          bestCost = cost;
          best = { chamferPct, scale, dx, dy };
        }
      }
    }
  }

  const safeChance = Math.max(chanceChamferPct, 0.01);
  return {
    identityChamferPct,
    chanceChamferPct,
    informative: chanceChamferPct >= MIN_INFORMATIVE_CHANCE_PCT,
    identityRatio: identityChamferPct / safeChance,
    bestChamferPct: best.chamferPct,
    bestRatio: best.chamferPct / safeChance,
    bestScale: best.scale,
    bestOffsetXPct: (best.dx / diagonal) * 100,
    bestOffsetYPct: (best.dy / diagonal) * 100,
    edgePoints: points.length,
  };
}

// --- per-element analysis ----------------------------------------------------

// Grow a mask by `radius` grid pixels, reusing the chamfer distance transform
// rather than a second neighbourhood loop.
function dilateMask(mask, width, height, radius) {
  const dist = distanceTransform(mask, width, height);
  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) if (dist[p] <= radius) out[p] = 1;
  return out;
}

// Shrink a mask by `radius`: the complement's dilation, inverted.
function erodeMask(mask, width, height, radius) {
  const complement = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) complement[p] = mask[p] ? 0 : 1;
  const grown = dilateMask(complement, width, height, radius);
  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) out[p] = grown[p] ? 0 : 1;
  return out;
}

// Morphological closing: the solid region a set of scribble strokes covers.
// Dilating alone would inflate the region past what the child actually filled,
// so the same radius is eroded back off.
function closeMask(mask, width, height, radius) {
  const grown = dilateMask(mask, width, height, radius);
  const complement = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) complement[p] = grown[p] ? 0 : 1;
  const grownComplement = dilateMask(complement, width, height, radius);
  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) out[p] = grownComplement[p] ? 0 : 1;
  return out;
}

function connectedComponents(mask, width, height) {
  const labels = new Int32Array(width * height).fill(-1);
  const components = [];
  const queue = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = components.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let border = 0;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p / width) | 0;
      area++;
      sx += x;
      sy += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border++;
      const tryPush = (q) => {
        if (q >= 0 && q < mask.length && mask[q] && labels[q] === -1) {
          labels[q] = label;
          queue[tail++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x < width - 1) tryPush(p + 1);
      tryPush(p - width);
      tryPush(p + width);
    }
    components.push({
      area,
      cx: sx / area,
      cy: sy / area,
      borderContact: border / (2 * (width + height)),
    });
  }
  return components;
}

function labPalette() {
  return PALETTE.map(({ hex, label }) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return { label, hex, lab: srgbToLab(r, g, b) };
  });
}

// Input elements: ink pixels grouped by nearest palette color (each significant
// color forms one element even when drawn as several marks — the scorer tracks
// where the *color mass* sits, which is what a viewer reads as layout).
function inputElements(grid, mask) {
  const { data, width, height } = grid;
  const palette = labPalette();
  const perColor = new Map();
  for (let p = 0, i = 0; p < mask.length; p++, i += 3) {
    if (!mask[p]) continue;
    const lab = srgbToLab(data[i], data[i + 1], data[i + 2]);
    let bestColor = null;
    let bestD = Infinity;
    for (const color of palette) {
      const d = labDistance(lab, color.lab);
      if (d < bestD) {
        bestD = d;
        bestColor = color;
      }
    }
    if (bestD > INPUT_COLOR_MATCH_DELTA_E) continue;
    const x = p % width;
    const y = (p / width) | 0;
    const entry = perColor.get(bestColor.label) ?? {
      color: bestColor,
      area: 0,
      sx: 0,
      sy: 0,
      minX: width,
      maxX: 0,
      minY: height,
      maxY: 0,
      mask: new Uint8Array(mask.length),
    };
    entry.mask[p] = 1;
    entry.area++;
    entry.sx += x;
    entry.sy += y;
    entry.minX = Math.min(entry.minX, x);
    entry.maxX = Math.max(entry.maxX, x);
    entry.minY = Math.min(entry.minY, y);
    entry.maxY = Math.max(entry.maxY, y);
    perColor.set(bestColor.label, entry);
  }
  const frameArea = width * height;
  const closeRadius = Math.max(2, Math.round(Math.max(width, height) * FILL_CLOSE_RADIUS_FRACTION));
  const elements = [...perColor.values()]
    .filter((entry) => entry.area / frameArea >= ELEMENT_MIN_AREA_FRACTION)
    .map((entry) => {
      const areaFraction = entry.area / frameArea;
      const boxArea = (entry.maxX - entry.minX + 1) * (entry.maxY - entry.minY + 1);
      const inkDensity = entry.area / boxArea;
      const spanFraction = Math.max(
        (entry.maxX - entry.minX + 1) / width,
        (entry.maxY - entry.minY + 1) / height
      );
      // Fill is decided before wash and compact: a scribbled-in sea spans the
      // frame like a wash and a coloured-in apple is compact, but for both the
      // question is whether the area got coloured, not where its strokes landed.
      // Density alone would also catch a shape the child drew solid — a boat
      // hull — and that one is a subject whose position and scale still matter,
      // so a fill must additionally show the gaps between passes that closing
      // the mask fills in. A solid shape closes to itself; a scribble does not.
      const dense = inkDensity >= FILL_INK_DENSITY_MIN && areaFraction >= FILL_MIN_AREA_FRACTION;
      const region = dense ? closeMask(entry.mask, width, height, closeRadius) : null;
      const regionArea = region ? region.reduce((sum, v) => sum + v, 0) : 0;
      const strokeGapFraction = regionArea ? 1 - entry.area / regionArea : 0;
      const isFill = dense && strokeGapFraction >= FILL_STROKE_GAP_MIN;
      const kind = isFill
        ? 'fill'
        : spanFraction >= WASH_MIN_SPAN_FRACTION || areaFraction >= WASH_MIN_AREA_FRACTION
          ? 'wash'
          : 'compact';
      return {
        label: entry.color.label,
        hex: entry.color.hex,
        lab: entry.color.lab,
        areaFraction,
        inkDensity,
        strokeGapFraction,
        kind,
        mask: entry.mask,
        region: isFill ? region : null,
        centroid: { x: entry.sx / entry.area / width, y: entry.sy / entry.area / height },
      };
    })
    .sort((a, b) => b.areaFraction - a.areaFraction);

  // A fill region swallows whatever the child drew inside it (the boat on the
  // water), so those pixels are lifted out before the region is scored —
  // otherwise a correctly painted sea is charged for the boat floating in it.
  const neighbourMargin = Math.max(
    1,
    Math.round(Math.max(width, height) * FILL_NEIGHBOUR_MARGIN_FRACTION)
  );
  for (const element of elements) {
    if (!element.region) continue;
    for (const other of elements) {
      if (other === element) continue;
      // Antialiasing along a stroke lands a rim of pixels on neighbouring
      // palette entries, so one drawn mark surfaces as two or three elements —
      // and that rim traces every scribble pass, so subtracting it would have
      // the fill cut itself to shreds. Two guards: a near-identical colour is
      // the same ink, and eroding by a pixel deletes a rim entirely while a real
      // subject sitting in the fill (the boat on the water) survives it.
      if (labDistance(element.lab, other.lab) < NEIGHBOUR_DISTINCT_DELTA_E) continue;
      const core = erodeMask(other.mask, width, height, 1);
      if (!core.some(Boolean)) continue;
      const grown = dilateMask(core, width, height, neighbourMargin);
      for (let q = 0; q < element.region.length; q++) if (grown[q]) element.region[q] = 0;
    }
  }
  return elements;
}

// Score one fill region on the two things that make it a fill: did that area
// come back coloured in, and did it come back as an area rather than as the
// child's strokes redrawn on top of a painted one.
function matchFill(element, outputGrid, outputEdgeDistance) {
  const { data, width, height } = outputGrid;
  const elementChroma = Math.hypot(element.lab[1], element.lab[2]);
  const elementHue = Math.atan2(element.lab[2], element.lab[1]);
  const byHue = elementChroma >= FILL_ACHROMATIC_ELEMENT_CHROMA;
  const isElementColour = (i) => {
    const lab = srgbToLab(data[i], data[i + 1], data[i + 2]);
    if (!byHue) return labDistance(lab, element.lab) <= FILL_COLOR_MATCH_DELTA_E;
    if (Math.hypot(lab[1], lab[2]) < FILL_MIN_CHROMA) return false;
    const delta = Math.abs(((Math.atan2(lab[2], lab[1]) - elementHue) * 180) / Math.PI);
    return Math.min(delta, 360 - delta) <= FILL_HUE_TOLERANCE_DEG;
  };

  const spillMargin = Math.max(1, Math.round(Math.max(width, height) * FILL_SPILL_MARGIN_FRACTION));
  const allowed = dilateMask(element.region, width, height, spillMargin);
  let regionArea = 0;
  let covered = 0;
  let chanceDistance = 0;
  const paint = [0, 0, 0];
  for (let p = 0, i = 0; p < element.region.length; p++, i += 3) {
    if (!element.region[p]) continue;
    regionArea++;
    chanceDistance += outputEdgeDistance[p];
    if (!isElementColour(i)) continue;
    covered++;
    const lab = srgbToLab(data[i], data[i + 1], data[i + 2]);
    paint[0] += lab[0];
    paint[1] += lab[1];
    paint[2] += lab[2];
  }
  if (!regionArea) return { found: false, backgroundLike: false };

  // With nothing of the child's colour in the region there is no paint to
  // recognize elsewhere, and coverage is already scoring that as the failure.
  let spilled = 0;
  if (covered) {
    const fillPaint = paint.map((sum) => sum / covered);
    for (let p = 0, i = 0; p < element.region.length; p++, i += 3) {
      if (element.region[p] || allowed[p]) continue;
      const lab = srgbToLab(data[i], data[i + 1], data[i + 2]);
      if (labDistance(lab, fillPaint) <= FILL_SPILL_MATCH_DELTA_E) spilled++;
    }
  }

  // Where the child's passes actually fell, and how far the output's nearest
  // edge is from each of them.
  const strokePoints = maskEdgePoints(element.mask, width, height).filter(
    ([x, y]) => element.region[y * width + x]
  );
  let strokeDistance = 0;
  for (const [x, y] of strokePoints) strokeDistance += outputEdgeDistance[y * width + x];
  const chance = chanceDistance / regionArea;
  const strokeEchoRatio =
    strokePoints.length && chance > 0 ? strokeDistance / strokePoints.length / chance : 1;

  return {
    found: true,
    backgroundLike: false,
    regionAreaFraction: regionArea / (width * height),
    coverage: covered / regionArea,
    spillRatio: spilled / regionArea,
    strokeEchoRatio,
  };
}

// Locate one input element's color mass in the output. Components that own a
// large share of the frame border are background washes that adopted the
// element's hue (a sky matching the water's blue) and are excluded; when
// nothing but background matched, that is reported as `backgroundLike` — a
// real observation about the output, distinct from "this color is gone".
function matchElement(element, outputGrid) {
  const { data, width, height } = outputGrid;
  const mask = new Uint8Array(width * height);
  let area = 0;
  for (let p = 0, i = 0; p < mask.length; p++, i += 3) {
    const lab = srgbToLab(data[i], data[i + 1], data[i + 2]);
    if (labDistance(lab, element.lab) <= OUTPUT_COLOR_MATCH_DELTA_E) {
      mask[p] = 1;
      area++;
    }
  }
  if (!area) return { found: false, backgroundLike: false };

  const components = connectedComponents(mask, width, height);
  const foreground = components.filter((c) => c.borderContact < BACKGROUND_BORDER_CONTACT_FRACTION);
  const frameArea = width * height;
  if (!foreground.length) return { found: false, backgroundLike: true };

  const largest = foreground.sort((a, b) => b.area - a.area)[0];
  const kept = foreground.filter((c) => c.area >= largest.area * 0.25);
  let keptArea = 0;
  let sx = 0;
  let sy = 0;
  for (const c of kept) {
    keptArea += c.area;
    sx += c.cx * c.area;
    sy += c.cy * c.area;
  }
  if (keptArea / frameArea < ELEMENT_MIN_AREA_FRACTION / 2) {
    const backgroundArea = area - foreground.reduce((sum, c) => sum + c.area, 0);
    return { found: false, backgroundLike: backgroundArea / frameArea > 0.1 };
  }
  return {
    found: true,
    backgroundLike: false,
    areaFraction: keptArea / frameArea,
    centroid: { x: sx / keptArea / width, y: sy / keptArea / height },
  };
}

function compareElements(elements, outputGrid, outputEdgeDistance) {
  return elements.map((element) => {
    const match =
      element.kind === 'fill'
        ? matchFill(element, outputGrid, outputEdgeDistance)
        : matchElement(element, outputGrid);
    if (!match.found) {
      return {
        label: element.label,
        hex: element.hex,
        kind: element.kind,
        inputAreaFraction: element.areaFraction,
        found: false,
        backgroundLike: match.backgroundLike,
      };
    }
    if (element.kind === 'fill') {
      return {
        label: element.label,
        hex: element.hex,
        kind: element.kind,
        inputAreaFraction: element.areaFraction,
        found: true,
        backgroundLike: false,
        regionAreaFraction: match.regionAreaFraction,
        coverage: match.coverage,
        spillRatio: match.spillRatio,
        strokeEchoRatio: match.strokeEchoRatio,
      };
    }
    const shift = Math.hypot(
      match.centroid.x - element.centroid.x,
      match.centroid.y - element.centroid.y
    );
    return {
      label: element.label,
      hex: element.hex,
      kind: element.kind,
      inputAreaFraction: element.areaFraction,
      found: true,
      backgroundLike: false,
      centroidShiftPct: shift * 100,
      scaleFactor: Math.sqrt(match.areaFraction / element.areaFraction),
      inputCentroid: element.centroid,
      outputCentroid: match.centroid,
    };
  });
}

// --- composite ---------------------------------------------------------------

// Tolerances for the 0-100 composite: drift inside these bands barely costs,
// past ~2× them the term bottoms out. Calibrated on the committed scrapbook
// reference run so visibly faithful outputs land high and visibly
// enlarged/recentered ones land low — locked by
// tools/model-eval/tests/composition-score.test.mjs.
const RATIO_TOLERANCE = 0.5;
const SHIFT_TOLERANCE_PCT = 8;
const WASH_SHIFT_TOLERANCE_PCT = 16;
const SCALE_TOLERANCE_LOG2 = 0.8;

// What a compact element scores when its color went missing or dissolved into
// the background — a real fidelity loss, but cheaper than maximal measured
// drift so a tuned-beyond-recognition hue doesn't outweigh a moved subject.
const LOST_COMPACT_ELEMENT_VALUE = 0.25;

export function compositeScore(global, elementComparisons) {
  const terms = [];
  if (global) {
    terms.push({
      weight: 1,
      // Only an explicit false is saturation — rows scored before the flag
      // existed carry no `informative` key and stay trusted.
      value:
        global.informative === false
          ? SATURATED_EDGE_MAP_VALUE
          : Math.exp(-((global.identityRatio / RATIO_TOLERANCE) ** 2)),
    });
  }
  for (const element of elementComparisons) {
    const weight = Math.sqrt(element.inputAreaFraction) * (element.kind === 'wash' ? 0.5 : 1);

    if (!element.found) {
      if (element.kind === 'compact' || element.kind === 'fill') {
        terms.push({ weight, value: LOST_COMPACT_ELEMENT_VALUE });
      }
      continue;
    }
    if (element.kind === 'fill') {
      const coverageTerm = clamp01(element.coverage / FILL_COVERAGE_TARGET);
      const containmentTerm = Math.exp(-((element.spillRatio / FILL_SPILL_TOLERANCE) ** 2));
      // Inverted against the other terms on purpose: here a LOW ratio is the
      // failure, because it means the child's strokes are still being drawn.
      const filledNotDrawnTerm =
        1 - Math.exp(-((element.strokeEchoRatio / FILL_STROKE_ECHO_TOLERANCE) ** 2));
      terms.push({ weight, value: coverageTerm * containmentTerm * filledNotDrawnTerm });
      continue;
    }
    if (element.kind === 'wash') {
      terms.push({
        weight,
        value: Math.exp(-((element.centroidShiftPct / WASH_SHIFT_TOLERANCE_PCT) ** 2)),
      });
      continue;
    }
    const shiftTerm = Math.exp(-((element.centroidShiftPct / SHIFT_TOLERANCE_PCT) ** 2));
    const scaleTerm = Math.exp(
      -((Math.abs(Math.log2(element.scaleFactor)) / SCALE_TOLERANCE_LOG2) ** 2)
    );
    terms.push({ weight, value: shiftTerm * scaleTerm });
  }
  if (!terms.length) return null;
  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  const value = terms.reduce((sum, t) => sum + t.weight * t.value, 0) / totalWeight;
  return Math.round(clamp01(value) * 100);
}

/**
 * Score how faithfully `outputBytes` keeps the composition of `inputBytes`.
 * Both are image buffers (PNG/JPEG/WebP). Returns global chamfer + drift
 * diagnostics, per-element position/scale comparisons, and a 0-100 composite.
 */
export async function scoreComposition({ inputBytes, outputBytes }) {
  const meta = await sharp(inputBytes).metadata();
  const { width, height } = gridSizeFor(meta.width, meta.height);
  const [inputGrid, outputGrid] = await Promise.all([
    loadGrid(inputBytes, width, height),
    loadGrid(outputBytes, width, height),
  ]);

  const paper = estimatePaperColor(inputGrid);
  const mask = inkMask(inputGrid, paper);
  const elements = inputElements(inputGrid, mask);

  // Fill regions are deliberately kept out of the global chamfer. Inside one,
  // reproducing the child's strokes is the failure being measured, not the
  // fidelity being rewarded — leaving them in let an output paint the sea and
  // redraw the scribbles over it to score as the most faithful of the set.
  const lineMask = Uint8Array.from(mask);
  for (const element of elements) {
    if (!element.region) continue;
    // The whole zone comes out, not just the pixels that matched this element's
    // colour: the antialiased rim of a scribble lands on a neighbouring palette
    // entry, and leaving those rim pixels in would trace the very strokes the
    // exclusion exists to stop rewarding.
    const zone = new Uint8Array(lineMask.length);
    for (let p = 0; p < zone.length; p++) zone[p] = element.region[p] || element.mask[p] ? 1 : 0;
    const grown = dilateMask(zone, width, height, 1);
    for (let p = 0; p < lineMask.length; p++) if (grown[p]) lineMask[p] = 0;
  }
  const points = maskEdgePoints(lineMask, width, height);
  const outputEdges = sobelEdgeMap(outputGrid);
  const dist = distanceTransform(outputEdges, width, height);
  const global = globalAlignment(points, dist, width, height);

  const elementComparisons = compareElements(elements, outputGrid, dist);

  return {
    grid: { width, height },
    global,
    elements: elementComparisons,
    layoutScore: compositeScore(global, elementComparisons),
  };
}
