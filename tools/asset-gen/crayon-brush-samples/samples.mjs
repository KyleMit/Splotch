// Reference sample specs for the crayon brush mode. Grouped in progressive
// stages so the set can be generated and reviewed incrementally:
//   1-  single lines (one crayon stroke per color)
//   2-  same-color overdraw (wax buildup where a stroke is drawn over again)
//   3-  different-color overdraw (wax layering / partial color mixing)
//   4-  scribble types (the marks a toddler actually makes)
//   5-  fills & swatches (area coverage, texture at a glance)
//
// Every prompt shares BASE so the whole set reads as one consistent material —
// the thing that varies between samples is the MARK, not the medium or camera.

const BASE =
  "Top-down flat scan of a real children's wax crayon mark on off-white lightly " +
  'textured drawing paper. Authentic waxy crayon look: grainy broken coverage, ' +
  'the paper tooth showing through as tiny white speckles, slightly uneven ' +
  'pressure so the mark is darker in some spots and lighter at the edges, small ' +
  'waxy buildup at the ends of strokes. Only the crayon mark is visible — no ' +
  'crayon, no hand, no shadow, plain paper background, soft even lighting, no ' +
  'photographic vignette. Centered with generous white margin around the mark.';

const stroke = (id, label, mark) => ({ id, label, prompt: `${BASE} ${mark}` });

// ── Stage 1: single lines, one per color ────────────────────────────────────
const COLORS = [
  ['red', 'a bright cherry red crayon'],
  ['orange', 'a warm orange crayon'],
  ['yellow', 'a golden yellow crayon'],
  ['green', 'a grass green crayon'],
  ['blue', 'a sky blue crayon'],
  ['purple', 'a violet purple crayon'],
  ['brown', 'a chocolate brown crayon'],
  ['black', 'a black crayon'],
  ['pink', 'a bubblegum pink crayon'],
];

const stage1 = COLORS.map(([c, desc]) =>
  stroke(
    `1-line-${c}`,
    `single ${c} line`,
    `The mark is ONE single straight horizontal stroke drawn left to right with ${desc}, about the thickness of a crayon tip.`
  )
);

// ── Stage 2: same-color overdraw (buildup) ──────────────────────────────────
const stage2 = [
  stroke(
    '2-buildup-red',
    'red drawn over twice',
    'The mark is a single horizontal red crayon stroke that has been traced back over a second time along the SAME path. Where the two passes overlap the red is visibly darker, denser and more opaque, with less paper showing through, than a single light pass.'
  ),
  stroke(
    '2-buildup-blue-halfoverlap',
    'blue, right half double-passed',
    'The mark is one horizontal blue crayon stroke where the LEFT half is a single light pass (grainy, lots of paper showing) and the RIGHT half has been gone over two or three more times so it is deep, saturated and nearly solid blue — a clear left-to-right gradient from faint to heavy from the same crayon.'
  ),
  stroke(
    '2-buildup-green-scribble',
    'green scribble built up in the center',
    'The mark is a loose green back-and-forth scribble where the center has been scribbled over many more times than the edges, so the middle is a dense saturated green and the outer strokes stay light and grainy.'
  ),
  stroke(
    '2-buildup-brown-pressure',
    'brown light vs heavy pressure',
    'Two short parallel brown crayon strokes stacked one above the other: the top drawn with light pressure (pale, broken, speckled) and the bottom drawn with heavy pressure (dark, waxy, almost solid) — the same brown crayon, different pressure.'
  ),
];

// ── Stage 3: different-color overdraw (layering / mixing) ────────────────────
const stage3 = [
  stroke(
    '3-cross-red-blue',
    'red stroke crossed by blue',
    'A horizontal red crayon stroke and a vertical blue crayon stroke crossing near the center in a plus shape. Where they overlap the wax layers into a darker purplish patch, while each stroke stays clearly red or blue away from the crossing.'
  ),
  stroke(
    '3-cross-yellow-blue',
    'yellow under blue → green',
    'A horizontal yellow crayon stroke with a blue crayon stroke drawn across it. Where blue is layered over yellow the waxes blend into a greenish overlap, while the yellow and blue stay their own colors outside the overlap.'
  ),
  stroke(
    '3-over-yellow-red',
    'red drawn over a yellow line',
    'A yellow crayon stroke with a red crayon stroke drawn directly over most of it along the same path. The overlap reads as a warm orange-red where red wax sits on yellow wax, with a little pure yellow peeking out at the edges.'
  ),
  stroke(
    '3-layer-purple-pink-blue',
    'pink and blue layered into purple',
    'A short pink crayon scribble and a short blue crayon scribble overlapping in the same patch, the layered waxes reading as mottled purple in the middle where they mix, pink and blue still visible at the fringes.'
  ),
];

// ── Stage 4: scribble types (the real toddler vocabulary) ────────────────────
const stage4 = [
  stroke(
    '4-scribble-backforth-blue',
    'back-and-forth fill (blue)',
    'The mark is a tight back-and-forth horizontal scribble in blue crayon roughly filling a small square area, the way a toddler colors in a shape.'
  ),
  stroke(
    '4-scribble-circular-red',
    'circular scribble (red)',
    'The mark is a loose circular round-and-round scribble in red crayon, overlapping loops building up a rough disc.'
  ),
  stroke(
    '4-scribble-zigzag-green',
    'zigzag (green)',
    'The mark is a single sharp zigzag / lightning-bolt line in green crayon, drawn in one continuous motion.'
  ),
  stroke(
    '4-scribble-hatch-purple',
    'parallel hatching (purple)',
    'The mark is several roughly parallel diagonal purple crayon strokes side by side, like quick hatching, not touching.'
  ),
  stroke(
    '4-scribble-loops-orange',
    'loop-de-loops (orange)',
    'The mark is a row of connected loop-de-loop cursive loops in orange crayon across the page.'
  ),
  stroke(
    '4-scribble-spiral-brown',
    'spiral (brown)',
    'The mark is a single spiral wound from the outside in, in brown crayon.'
  ),
  stroke(
    '4-scribble-wild-multi',
    'wild multicolor scribble',
    'The mark is an energetic tangled toddler scribble using red, blue and yellow crayons together, lines crossing every direction, with layered overlaps where colors cross.'
  ),
  stroke(
    '4-scribble-dots-pink',
    'stabbed dots (pink)',
    'The mark is a scatter of short stabbed pink crayon dots and dashes, as if tapped onto the paper.'
  ),
];

// ── Stage 5: fills & swatches (texture at a glance) ──────────────────────────
const stage5 = [
  stroke(
    '5-swatch-red',
    'solid-ish red fill swatch',
    'The mark is a small rectangular patch colored solidly with red crayon, heavy even pressure, showing the characteristic waxy grain and faint paper tooth of a fully filled crayon area.'
  ),
  stroke(
    '5-swatch-blue-light',
    'light blue fill swatch',
    'The mark is a small rectangular patch lightly filled with blue crayon, a single gentle pass so lots of white paper still shows through the grain.'
  ),
  stroke(
    '5-swatch-gradient-green',
    'green pressure gradient swatch',
    'The mark is a small rectangular green crayon swatch that fades from heavy saturated green on one side to faint grainy green on the other, a smooth pressure gradient.'
  ),
  stroke(
    '5-swatch-blend-sunset',
    'blended sunset swatch',
    'The mark is a small patch where yellow, orange and red crayon are layered and blended edge to edge into a warm sunset gradient, waxy crayon texture throughout.'
  ),
];

export const SAMPLES = [...stage1, ...stage2, ...stage3, ...stage4, ...stage5];
