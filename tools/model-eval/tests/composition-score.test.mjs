import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  compositeScore,
  distanceTransform,
  estimatePaperColor,
  gridSizeFor,
  inkMask,
  maskEdgePoints,
  scoreComposition,
  sobelEdgeMap,
} from '../lib/composition-score.mjs';

const PAPER = '#FCFBF7';

// Palette hexes from web/src/lib/palette.ts, which inputElements matches against.
const RED = '#EC534E';
const YELLOW = '#F9D24F';

const rasterize = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// A boat-pond-like layout: compact red square mid-left, compact yellow disc
// top-right, on plain paper.
const inputDrawing = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="${PAPER}"/>
    <rect x="70" y="150" width="70" height="70" fill="${RED}"/>
    <circle cx="250" cy="70" r="30" fill="${YELLOW}"/>
  </svg>`);

// A faithful restyle: same layout, tuned hues, a sky wash instead of paper.
const faithfulOutput = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="#BEE3F5"/>
    <rect x="68" y="148" width="74" height="74" rx="8" fill="#E64540"/>
    <circle cx="250" cy="70" r="33" fill="#FFD84D"/>
  </svg>`);

// The failure mode under test: the red subject enlarged ~1.8x and recentered;
// the yellow disc grown and nudged.
const driftedOutput = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="#BEE3F5"/>
    <rect x="97" y="97" width="126" height="126" rx="10" fill="#E64540"/>
    <circle cx="220" cy="90" r="48" fill="#FFD84D"/>
  </svg>`);

const BLUE = '#62A2E9';

// A scribbled-in region: back-and-forth blue passes across a band, the way a
// toddler colours water in. The gaps between passes are what make it a fill
// rather than a drawn shape.
const scribbleStrokes = (y0, y1, rows) => {
  const step = (y1 - y0) / rows;
  return Array.from({ length: rows }, (_, i) => {
    const y = y0 + step * (i + 0.5);
    return `<path d="M 30 ${y} L 290 ${y - 4}" stroke="${BLUE}" stroke-width="7" fill="none"/>`;
  }).join('');
};

const scribbleFilledInput = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="${PAPER}"/>
    ${scribbleStrokes(170, 250, 7)}
    <circle cx="250" cy="60" r="28" fill="${YELLOW}"/>
  </svg>`);

// What the child meant: that whole band is water now.
const regionColouredIn = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="#CFE7F7"/>
    <rect x="24" y="164" width="272" height="92" fill="#3E92E8"/>
    <circle cx="250" cy="60" r="30" fill="#FFD84D"/>
  </svg>`);

// The cheat: the same water painted underneath, with the child's strokes
// redrawn on top of it so the edges still line up stroke for stroke.
const regionWithStrokesOnTop = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="#CFE7F7"/>
    <rect x="24" y="164" width="272" height="92" fill="#3E92E8"/>
    ${scribbleStrokes(170, 250, 7)}
    <circle cx="250" cy="60" r="30" fill="#FFD84D"/>
  </svg>`);

// Line work over the same span: one drawn wave, not a coloured-in area.
const drawnLineInput = () =>
  rasterize(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    <rect width="320" height="320" fill="${PAPER}"/>
    <path d="M 30 210 L 290 206" stroke="${BLUE}" stroke-width="7" fill="none"/>
    <circle cx="250" cy="60" r="28" fill="${YELLOW}"/>
  </svg>`);

describe('gridSizeFor', () => {
  it('keeps the long side fixed and preserves aspect', () => {
    expect(gridSizeFor(1024, 1024)).toEqual({ width: 160, height: 160 });
    expect(gridSizeFor(1536, 1024)).toEqual({ width: 160, height: 107 });
    expect(gridSizeFor(1024, 1536)).toEqual({ width: 107, height: 160 });
  });
});

describe('paper and ink extraction', () => {
  it('finds the paper color from the border and masks only the marks', async () => {
    const bytes = await inputDrawing();
    const raw = await sharp(bytes).resize(160, 160, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const grid = { data: raw, width: 160, height: 160 };
    const paper = estimatePaperColor(grid);
    expect(paper[0]).toBeGreaterThan(240);
    expect(paper[1]).toBeGreaterThan(240);

    const mask = inkMask(grid, paper);
    const inkFraction = mask.reduce((a, b) => a + b, 0) / mask.length;
    expect(inkFraction).toBeGreaterThan(0.04);
    expect(inkFraction).toBeLessThan(0.12);

    const points = maskEdgePoints(mask, 160, 160);
    expect(points.length).toBeGreaterThan(50);
  });
});

describe('edge map and distance transform', () => {
  it('marks low-luminance-contrast but high-chroma boundaries as edges', () => {
    const width = 32;
    const height = 32;
    const data = Buffer.alloc(width * height * 3);
    for (let p = 0; p < width * height; p++) {
      const x = p % width;
      // Pale yellow left half, pale blue right half — near-equal luminance.
      const [r, g, b] = x < width / 2 ? [250, 230, 140] : [150, 200, 235];
      data[p * 3] = r;
      data[p * 3 + 1] = g;
      data[p * 3 + 2] = b;
    }
    const edges = sobelEdgeMap({ data, width, height });
    const midColumnEdges = Array.from({ length: height - 2 }, (_, i) => i + 1).filter(
      (y) => edges[y * width + width / 2] || edges[y * width + width / 2 - 1]
    );
    expect(midColumnEdges.length).toBeGreaterThan(height - 8);
  });

  it('measures pixel distance to the nearest edge', () => {
    const width = 9;
    const height = 9;
    const edges = new Uint8Array(width * height);
    edges[4 * width + 4] = 1;
    const dist = distanceTransform(edges, width, height);
    expect(dist[4 * width + 4]).toBe(0);
    expect(dist[4 * width + 8]).toBeCloseTo(4, 1);
  });
});

// Deterministic RGB noise: an edge at nearly every pixel, preserving nothing.
const noiseOutput = () => {
  let seed = 42;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const width = 160;
  const height = 160;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.floor(next() * 256);
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};

describe('scoreComposition', () => {
  it('scores a faithful restyle far above an enlarged-and-recentered one', async () => {
    const inputBytes = await inputDrawing();
    const faithful = await scoreComposition({ inputBytes, outputBytes: await faithfulOutput() });
    const drifted = await scoreComposition({ inputBytes, outputBytes: await driftedOutput() });

    expect(faithful.layoutScore).toBeGreaterThanOrEqual(80);
    expect(faithful.global.informative).toBe(true);
    expect(drifted.layoutScore).toBeLessThan(faithful.layoutScore - 25);
    expect(faithful.global.identityRatio).toBeLessThan(drifted.global.identityRatio);
  });

  it('treats an edge-saturated output as non-informative, not as a perfect match', async () => {
    const inputBytes = await inputDrawing();
    const noisy = await scoreComposition({ inputBytes, outputBytes: await noiseOutput() });

    expect(noisy.global.informative).toBe(false);
    expect(noisy.global.identityRatio).toBeLessThan(0.05);
    expect(noisy.layoutScore).toBeLessThan(45);
  });

  it('names the drift per element: the red subject grew and moved', async () => {
    const inputBytes = await inputDrawing();
    const drifted = await scoreComposition({ inputBytes, outputBytes: await driftedOutput() });
    const red = drifted.elements.find((el) => el.label === 'Red');
    expect(red.found).toBe(true);
    expect(red.scaleFactor).toBeGreaterThan(1.5);
    expect(red.scaleFactor).toBeLessThan(2.2);
    expect(red.centroidShiftPct).toBeGreaterThan(5);

    const faithful = await scoreComposition({ inputBytes, outputBytes: await faithfulOutput() });
    const faithfulRed = faithful.elements.find((el) => el.label === 'Red');
    expect(faithfulRed.scaleFactor).toBeGreaterThan(0.85);
    expect(faithfulRed.scaleFactor).toBeLessThan(1.2);
    expect(faithfulRed.centroidShiftPct).toBeLessThan(3);
  });
});

describe('scribbled-in fill regions', () => {
  it('classes a scribbled band as a fill and a drawn line as line work', async () => {
    const filled = await scoreComposition({
      inputBytes: await scribbleFilledInput(),
      outputBytes: await regionColouredIn(),
    });
    const line = await scoreComposition({
      inputBytes: await drawnLineInput(),
      outputBytes: await regionColouredIn(),
    });
    expect(filled.elements.find((el) => el.label === 'Blue').kind).toBe('fill');
    expect(line.elements.find((el) => el.label === 'Blue')?.kind).not.toBe('fill');
  });

  it('does not class a shape the child drew solid as a fill', async () => {
    const solid = await scoreComposition({
      inputBytes: await inputDrawing(),
      outputBytes: await faithfulOutput(),
    });
    expect(solid.elements.every((el) => el.kind !== 'fill')).toBe(true);
  });

  it('scores colouring the region in far above redrawing the strokes over it', async () => {
    const inputBytes = await scribbleFilledInput();
    const coloured = await scoreComposition({
      inputBytes,
      outputBytes: await regionColouredIn(),
    });
    const strokesOnTop = await scoreComposition({
      inputBytes,
      outputBytes: await regionWithStrokesOnTop(),
    });
    const fillOf = (s) => s.elements.find((el) => el.label === 'Blue');
    expect(fillOf(coloured).coverage).toBeGreaterThan(0.85);
    // The cheat is legible in the echo ratio alone: the same coverage, but the
    // output's edges sit on the child's strokes instead of anywhere else.
    expect(fillOf(coloured).strokeEchoRatio).toBeGreaterThan(0.8);
    expect(fillOf(strokesOnTop).strokeEchoRatio).toBeLessThan(0.3);
    expect(coloured.layoutScore).toBeGreaterThan(strokesOnTop.layoutScore + 15);
  });
});

describe('compositeScore', () => {
  it('charges a lost compact element but skips a background-like wash', () => {
    const global = { identityRatio: 0.1 };
    const withLoss = compositeScore(global, [
      {
        label: 'Red',
        kind: 'compact',
        inputAreaFraction: 0.05,
        found: false,
        backgroundLike: true,
      },
    ]);
    const washOnly = compositeScore(global, [
      {
        label: 'Blue',
        kind: 'wash',
        inputAreaFraction: 0.05,
        found: false,
        backgroundLike: true,
      },
    ]);
    const clean = compositeScore(global, []);
    expect(withLoss).toBeLessThan(clean);
    expect(washOnly).toBe(clean);
  });

  it('returns null when nothing was measurable', () => {
    expect(compositeScore(null, [])).toBeNull();
  });
});
