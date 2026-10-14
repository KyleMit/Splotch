import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { scale, themes } from '../../web/src/lib/design/tokens.ts';
import { edgeFeather, FEATHER_REACH_SIGMAS } from '../../web/src/lib/glassPaneGeometry.ts';
import {
  GLASS_PANE_INKS,
  PAPER_GRAIN_COVERAGE,
  PAPER_GRAIN_RGB,
} from '../../experiments/native-architecture/src/rsdDrawing/glassPaneInk.ts';
import { glassPaneTiles } from '../../experiments/native-architecture/src/rsdDrawing/glassPaneTiles.ts';

const GRAIN = new URL('../../web/src/lib/assets/handmade-paper.webp', import.meta.url);
const SIGMA = 24;
const INK = { rgb: '0 0 0', alpha: 1 };
const CHANNEL_TOLERANCE = 1 / 255;
// The straight pieces between a gradient's color stops stray this far from the feather's curve.
const STOP_ERROR = 0.01;

// A tile's alpha at a point, read back from its style the way the renderer draws it: a flat color,
// or color stops interpolated along the gradient line or out from the radial gradient's center.
function tileAlpha(tile, x, y) {
  if (tile.backgroundColor) return Number(/\/ ([\d.]+)\)$/.exec(tile.backgroundColor)[1]);
  const image = tile.experimental_backgroundImage;
  const stops = [...image.matchAll(/\/ ([\d.]+)\) ([\d.]+)px/g)].map(([, alpha, at]) => [
    Number(at),
    Number(alpha),
  ]);
  const center = /at ([-\d.]+)px ([-\d.]+)px/.exec(image);
  const offset = center
    ? Math.hypot(x - tile.left - Number(center[1]), y - tile.top - Number(center[2]))
    : image.includes('to right')
      ? x - tile.left
      : y - tile.top;
  const after = stops.findIndex(([at]) => at >= offset);
  if (after <= 0) return stops[after === 0 ? 0 : stops.length - 1][1];
  const [[from, a], [to, b]] = [stops[after - 1], stops[after]];
  return a + ((b - a) * (offset - from)) / (to - from);
}

// What the pane lays over a point: every tile covering it, composited in turn.
function coverage(tiles, x, y) {
  return tiles
    .filter(
      (tile) =>
        x >= tile.left && x < tile.left + tile.width && y >= tile.top && y < tile.top + tile.height
    )
    .reduce((under, tile) => 1 - (1 - under) * (1 - tileAlpha(tile, x, y)), 0);
}

const normalCdf = (z) => {
  // Abramowitz & Stegun 7.1.26, the same approximation shipping's mask geometry uses.
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413061 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};

// The feathered mask shipping draws past a lone square corner: the blur of a quadrant is the
// product of two edge blurs, read through the feather table.
function shippingCorner(dx, dy) {
  const blurred = normalCdf(dx / SIGMA) * normalCdf(dy / SIGMA);
  let low = -10 * SIGMA;
  let high = 10 * SIGMA;
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2;
    if (normalCdf(middle / SIGMA) < blurred) low = middle;
    else high = middle;
  }
  return edgeFeather(low, SIGMA);
}

const rect = (x, y, width, height, radius = 0) => ({ x, y, width, height, radius });
const CLIP = rect(0, 0, 1000, 1000);

describe('the native glass pane tiles', () => {
  it('follow shipping’s feather across a straight edge', () => {
    const tiles = glassPaneTiles(
      { rects: [rect(300, 300, 400, 400)], clip: CLIP, sigma: SIGMA },
      INK
    );
    const reach = FEATHER_REACH_SIGMAS * SIGMA;
    for (let distance = -reach; distance <= reach; distance += 3) {
      const feather = edgeFeather(distance, SIGMA);
      expect(Math.abs(coverage(tiles, 500, 300 + distance) - feather)).toBeLessThan(STOP_ERROR);
      expect(Math.abs(coverage(tiles, 300 + distance, 500) - feather)).toBeLessThan(STOP_ERROR);
    }
  });

  // Negative control: centering the round feather on the solid region's own corner
  // (CORNER_DEPTH_SIGMAS of 14 / 24) overshoots this by about a fifth.
  it('stay within five percent of shipping’s blurred corner', () => {
    const tiles = glassPaneTiles(
      { rects: [rect(300, 300, 400, 400)], clip: CLIP, sigma: SIGMA },
      INK
    );
    const errors = [];
    for (let dx = -60; dx <= 60; dx += 4)
      for (let dy = -60; dy <= 60; dy += 4)
        errors.push(Math.abs(coverage(tiles, 300 + dx, 300 + dy) - shippingCorner(dx, dy)));
    expect(Math.max(...errors)).toBeLessThan(0.05);
  });

  // Negative control: without each shape giving way to the others' solid regions, the overlap of
  // two shapes takes the ink twice and this rises past the single coat.
  it('lay one coat where two shapes of a pane overlap', () => {
    const ink = { rgb: '0 0 0', alpha: 0.9 };
    const tiles = glassPaneTiles(
      { rects: [rect(100, 100, 400, 400), rect(300, 300, 400, 400, 20)], clip: CLIP, sigma: SIGMA },
      ink
    );
    // Where both are solid, and where one is solid under the other's feather.
    for (const [x, y] of [
      [350, 350],
      [400, 280],
      [280, 400],
      [480, 500],
      [500, 480],
    ])
      expect(coverage(tiles, x, y)).toBeCloseTo(ink.alpha, 3);
  });

  it('stop at the pane’s clip, as shipping’s pane box does', () => {
    const tiles = glassPaneTiles(
      { rects: [rect(-44, 600, 150, 500)], clip: rect(0, 75, 400, 1000), sigma: SIGMA },
      INK
    );
    for (const tile of tiles) {
      expect(tile.left).toBeGreaterThanOrEqual(0);
      expect(tile.top).toBeGreaterThanOrEqual(75);
      expect(tile.left + tile.width).toBeLessThanOrEqual(400);
      expect(tile.top + tile.height).toBeLessThanOrEqual(1075);
    }
  });
});

describe('the native glass pane ink', () => {
  it('holds the grain tile’s measured mean', async () => {
    const { data, info } = await sharp(GRAIN.pathname)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = info.width * info.height;
    let covered = 0;
    const laid = [0, 0, 0];
    for (let pixel = 0; pixel < pixels; pixel++) {
      const alpha = data[pixel * 4 + 3] / 255;
      covered += alpha;
      for (let channel = 0; channel < 3; channel++)
        laid[channel] += data[pixel * 4 + channel] * alpha;
    }
    expect(PAPER_GRAIN_COVERAGE).toBeCloseTo(covered / pixels, 4);
    PAPER_GRAIN_RGB.forEach((value, channel) =>
      expect(value).toBeCloseTo(laid[channel] / covered, 1)
    );
  });

  // Shipping's solid pane over any backdrop: the grain over a glassStrip tint of the paper over
  // that backdrop. A plain color matches it at every backdrop only if it passes as much of it.
  it.each(['light', 'dark'])('passes and paints what shipping’s %s pane does', (mode) => {
    const frost = parseFloat(scale.glassStrip) / 100;
    const tint = themes[mode].glassTintRgb.split(' ').map((byte) => Number(byte) / 255);
    const grain = PAPER_GRAIN_RGB.map((byte) => byte / 255);
    const ink = GLASS_PANE_INKS[mode];
    const color = ink.rgb.split(' ').map((byte) => Number(byte) / 255);
    for (const backdrop of [0, 0.5, 1])
      tint.forEach((t, channel) => {
        const shipping =
          PAPER_GRAIN_COVERAGE * grain[channel] +
          (1 - PAPER_GRAIN_COVERAGE) * (frost * t + (1 - frost) * backdrop);
        const native = ink.alpha * color[channel] + (1 - ink.alpha) * backdrop;
        expect(Math.abs(native - shipping)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      });
  });
});
