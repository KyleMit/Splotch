// Natural child-scribble pointer paths for the magic-brush store scene
// (gen-store-assets 03-magic): back-and-forth row fills and outward spirals
// placed over the farm cat coloring page, replacing the first marketing-frame
// design's mechanical diagonal sweeps.
//
// Geometry is authored per orientation in a fixed design space aligned to the
// coloring overlay's contain-fit rect (the same aspect as the page art), and
// scaled into the live rect at capture time, so a scribble lands on the same
// cat feature at every capture size. Stroke width comes from the app's brush
// (the scene sets stroke size 5), not from the paths.
//
// Every stroke starts at its right/center extreme rather than its left edge:
// the tool drawer's buttons float over the canvas's left column, and a
// pointer-down that lands on one would click it instead of drawing.

// Park–Miller LCG, deterministically seeded: reruns of the generator produce
// the identical scribbles, so captures are reproducible run to run.
const SCRIBBLE_SEED = 7;
const RNG_MULTIPLIER = 16807;
const RNG_MODULUS = 2147483647;

function createRng(seed = SCRIBBLE_SEED) {
  let s = seed;
  return () => {
    s = (s * RNG_MULTIPLIER) % RNG_MODULUS;
    return s / RNG_MODULUS;
  };
}

// Hand-wobble amplitudes (design-space px, from the design handoff): each row
// drifts vertically, each quadratic pass bows and lands loosely, and spirals
// breathe by a fraction of their radius.
const ROW_JITTER = 14;
const CONTROL_JITTER = 26;
const END_JITTER = 16;
const QUADS_PER_PASS = 4;
const QUAD_SAMPLES = 6;
const SPIRAL_SAMPLES_PER_TURN = 16;
const SPIRAL_INNER_RADIUS_FRACTION = 0.3;
const SPIRAL_WOBBLE_FRACTION = 0.07;
const SPIRAL_WOBBLE_CYCLES_PER_TURN = 2.7;
const SPIRAL_Y_SQUASH = 0.8;

const jitter = (rng, amplitude) => (rng() * 2 - 1) * amplitude;

function sampleQuadratic(points, p0, control, p1) {
  for (let i = 1; i <= QUAD_SAMPLES; i++) {
    const t = i / QUAD_SAMPLES;
    const u = 1 - t;
    points.push({
      x: u * u * p0.x + 2 * u * t * control.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * control.y + t * t * p1.y,
    });
  }
}

function rotateAbout(points, cx, cy, angle) {
  if (!angle) return points;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(({ x, y }) => ({
    x: cx + (x - cx) * cos - (y - cy) * sin,
    y: cy + (x - cx) * sin + (y - cy) * cos,
  }));
}

// One continuous back-and-forth fill: n passes of QUADS_PER_PASS loose
// quadratic segments, joined by rounded turnarounds, optionally rotated about
// the block's center (tilted fills like the hay bale).
function rows(rng, x0, x1, yTop, n, rowH, angle = 0) {
  const points = [];
  const rowY = Array.from({ length: n }, (_, i) => yTop + i * rowH + jitter(rng, ROW_JITTER));
  let cursor = { x: x1, y: rowY[0] };
  points.push(cursor);
  for (let row = 0; row < n; row++) {
    const rightToLeft = row % 2 === 0;
    const from = rightToLeft ? x1 : x0;
    const to = rightToLeft ? x0 : x1;
    for (let q = 0; q < QUADS_PER_PASS; q++) {
      const endX = from + ((to - from) * (q + 1)) / QUADS_PER_PASS;
      const end =
        q === QUADS_PER_PASS - 1
          ? { x: endX, y: rowY[row] + jitter(rng, END_JITTER) }
          : { x: endX + jitter(rng, END_JITTER), y: rowY[row] + jitter(rng, END_JITTER) };
      const control = {
        x: (cursor.x + end.x) / 2 + jitter(rng, END_JITTER),
        y: rowY[row] + jitter(rng, CONTROL_JITTER),
      };
      sampleQuadratic(points, cursor, control, end);
      cursor = end;
    }
    if (row < n - 1) {
      const nextStart = { x: cursor.x, y: rowY[row + 1] };
      const bulge = rightToLeft ? -rowH * 0.6 : rowH * 0.6;
      const control = { x: cursor.x + bulge, y: (cursor.y + nextStart.y) / 2 };
      sampleQuadratic(points, cursor, control, nextStart);
      cursor = nextStart;
    }
  }
  const centerX = (x0 + x1) / 2;
  const centerY = yTop + ((n - 1) * rowH) / 2;
  return rotateAbout(points, centerX, centerY, angle);
}

// One outward elliptical spiral with a gentle radial wobble — the round
// scribble a small child makes over a face or a cloud.
function loops(rng, cx, cy, rMax, turns) {
  const points = [];
  const phase = rng() * Math.PI * 2;
  const samples = Math.max(2, Math.round(turns * SPIRAL_SAMPLES_PER_TURN));
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const theta = phase + t * turns * Math.PI * 2;
    const wobble = 1 + SPIRAL_WOBBLE_FRACTION * Math.sin(SPIRAL_WOBBLE_CYCLES_PER_TURN * theta);
    const r =
      rMax * (SPIRAL_INNER_RADIUS_FRACTION + (1 - SPIRAL_INNER_RADIUS_FRACTION) * t) * wobble;
    points.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) * SPIRAL_Y_SQUASH });
  }
  return points;
}

// ── Per-orientation scribble scenes ─────────────────────────────────────────
// Portrait values come from the design handoff, authored against the tall cat
// page's contain rect (cat-tall.*, 2:3) in a 1090×1635 design space with the
// handoff's 266.5px sky offset already subtracted. Landscape mirrors the same
// coverage over the wide cat page (cat-wide.*, 3:2) in a 1635×1090 space:
// sky, clouds, butterfly, head, chest, legs, tail, hay, fence, grass, flowers.

const PORTRAIT_SCRIBBLES = {
  designWidth: 1090,
  designHeight: 1635,
  strokes: (rng) => [
    rows(rng, 200, 640, 108.5, 4, 58), // sky, left of the butterfly
    rows(rng, 670, 945, 133.5, 4, 56), // sky, right of the head
    loops(rng, 694, 248.5, 96, 3.2), // butterfly
    loops(rng, 258, 228.5, 66, 2.6), // upper-left cloud
    loops(rng, 893, 423.5, 56, 2.6), // right cloud
    loops(rng, 455, 613.5, 180, 3.2), // cat head
    loops(rng, 480, 983.5, 145, 2.6), // chest
    rows(rng, 310, 650, 1133.5, 3, 66), // lower body / front paws
    rows(rng, 770, 1050, 853.5, 5, 56, -0.35), // hay bale, tilted with its face
    rows(rng, 625, 835, 1301.5, 2, 54), // tail
    rows(rng, 235, 910, 1401.5, 2, 60), // grass mound
    loops(rng, 152, 1071.5, 52, 2.6), // flower
  ],
};

const LANDSCAPE_SCRIBBLES = {
  designWidth: 1635,
  designHeight: 1090,
  strokes: (rng) => [
    rows(rng, 64, 620, 60, 3, 58), // sky over the hay bale
    rows(rng, 660, 1030, 70, 2, 56), // sky between the clouds
    rows(rng, 1060, 1500, 80, 3, 56), // sky right, clear of the trash button
    loops(rng, 1283, 335, 96, 3.2), // butterfly
    loops(rng, 255, 165, 80, 2.6), // left cloud
    loops(rng, 703, 140, 52, 2.2), // middle cloud
    loops(rng, 1405, 152, 62, 2.6), // right cloud
    loops(rng, 910, 450, 170, 3.2), // cat head
    loops(rng, 800, 750, 130, 2.6), // chest / body
    rows(rng, 560, 990, 830, 2, 62), // legs and belly
    rows(rng, 455, 600, 330, 3, 56, -1.2), // upright tail
    rows(rng, 60, 440, 530, 4, 60, -0.1), // hay bale
    rows(rng, 1100, 1500, 500, 3, 62, 0.15), // fence
    rows(rng, 90, 1500, 790, 3, 64), // grass
    loops(rng, 160, 880, 52, 2.6), // pink flower
    loops(rng, 1365, 890, 55, 2.6), // purple flower
  ],
};

const SCENES = { portrait: PORTRAIT_SCRIBBLES, landscape: LANDSCAPE_SCRIBBLES };

/**
 * The scribble strokes for one orientation: design-space dimensions plus an
 * array of pointer point-lists, freshly generated from the fixed seed.
 */
export function magicScribbleScene(orientation) {
  const scene = SCENES[orientation];
  if (!scene) throw new Error(`Unknown magic scribble orientation ${orientation}`);
  const rng = createRng();
  return {
    designWidth: scene.designWidth,
    designHeight: scene.designHeight,
    strokes: scene.strokes(rng),
  };
}
