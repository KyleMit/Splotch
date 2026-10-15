import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { scale, themes } from '../../web/src/lib/design/tokens.ts';
import { featherAlpha, glassPaneShapes, paneBox } from '../../web/src/lib/glassPaneGeometry.ts';
import {
  GLASS_PANE_INKS,
  PAPER_GRAIN_COVERAGE,
  PAPER_GRAIN_RGB,
} from '../../experiments/native-architecture/src/rsdDrawing/glassPaneInk.ts';
import { glassPanePng } from '../../experiments/native-architecture/src/rsdDrawing/glassPanePng.ts';
import { glassPaneRaster } from '../../experiments/native-architecture/src/rsdDrawing/glassPaneRaster.ts';

const GRAIN = new URL('../../web/src/lib/assets/handmade-paper.webp', import.meta.url);
const INK_ALPHA = GLASS_PANE_INKS.light.alpha;
const CHANNEL_TOLERANCE = 1 / 255;
// How far the stretched raster may stray from shipping's mask, in composited alpha.
const MASK_TOLERANCE = 0.01;
// The steepest the feather itself climbs over this step, with room to spare: a jump past it at
// any step is a seam, not the feather.
const STEP_PX = 0.25;
const STEP_TOLERANCE = 0.02;
// Rendering shipping's mask by brute force: pixel supersampling and the Gaussian's extent.
const SUPERSAMPLE = 2;
const KERNEL_SIGMAS = 4;
// A full landscape phone rendered by brute force takes seconds; on a loaded host, several.
const BRUTE_FORCE_TIMEOUT_MS = 60_000;

// Shipping's toolbars, as glassPanes.ts measures them, with the flyout each layout opens.
const ROW = { swatchPx: 55, gapPx: 8, paddingPx: 20, slots: 8 };
function layout(width, height, overrides) {
  return {
    width,
    height,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: 'portrait',
    compact: false,
    railWidth: 84,
    railHeight: 75,
    panelInset: 8,
    buttonGap: 12,
    compactGap: 10,
    toggleSize: 48,
    count: 5,
    size: 50,
    optionSize: 50,
    brushOptions: 4,
    strokeOptions: 3,
    stroke: true,
    fullscreen: false,
    colorMenu: ROW,
    ...overrides,
  };
}
const PHONE_SEVEN = layout(390, 844, { count: 7 });
const TABLET = layout(1194, 834, {
  orientation: 'landscape',
  safe: { top: 0, right: 0, bottom: 20, left: 0 },
  count: 6,
  size: 60,
  optionSize: 60,
});
const COMPACT = layout(956, 440, {
  orientation: 'landscape',
  compact: true,
  safe: { top: 0, right: 0, bottom: 21, left: 0 },
  count: 6,
  size: 48,
  optionSize: 48,
  fullscreen: true,
});
const CASES = [
  ['a phone with seven actions and the Brush menu', PHONE_SEVEN, 'brush', true],
  ['a phone with seven actions and the Stroke Width menu', PHONE_SEVEN, 'stroke', true],
  ['a phone with the drawer open', layout(390, 844), null, true],
  ['a phone with the drawer closed', layout(390, 844), null, false],
  ['a tablet in landscape with the Stroke Width menu', TABLET, 'stroke', true],
  ['a landscape phone with the drawer open', COMPACT, null, true],
  ['a landscape phone with the Color menu', COMPACT, 'color', false],
];

// Shipping's SVG mask by brute force: each shape rasterised with its rounded corners, the union
// blurred inside the pane's box (the filter region, outside which the blur sees nothing), read
// through the feather table, at every pixel of the box.
function shippingMask(shape) {
  const box = paneBox(shape);
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  const inside = (x, y) =>
    shape.rects.some(({ x: left, y: top, width: across, height: down, radius = 0 }) => {
      if (x < left || x > left + across || y < top || y > top + down) return false;
      const r = Math.min(radius, across / 2, down / 2);
      const cx = Math.min(Math.max(x, left + r), left + across - r);
      const cy = Math.min(Math.max(y, top + r), top + down - r);
      return Math.hypot(x - cx, y - cy) <= r;
    });
  const coverage = new Float64Array(width * height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++)
        for (let sx = 0; sx < SUPERSAMPLE; sx++)
          hits += inside(
            box.x + column + (sx + 0.5) / SUPERSAMPLE,
            box.y + row + (sy + 0.5) / SUPERSAMPLE
          );
      coverage[row * width + column] = hits / SUPERSAMPLE ** 2;
    }
  const radius = Math.ceil(KERNEL_SIGMAS * shape.sigma);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) =>
    Math.exp(-((i - radius) ** 2) / (2 * shape.sigma ** 2))
  );
  const total = kernel.reduce((sum, weight) => sum + weight, 0);
  const pass = (source, horizontal) => {
    const out = new Float64Array(width * height);
    for (let row = 0; row < height; row++)
      for (let column = 0; column < width; column++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const c = horizontal ? column + k : column;
          const r = horizontal ? row : row + k;
          if (c < 0 || r < 0 || c >= width || r >= height) continue;
          sum += source[r * width + c] * kernel[k + radius];
        }
        out[row * width + column] = sum / total;
      }
    return out;
  };
  const blurred = pass(pass(coverage, true), false);
  return { box, width, height, mask: blurred.map(featherAlpha(shape.sigma)) };
}

// What the stretched image shows at a point: its samples, which run edge to edge of the box,
// interpolated, and nothing past the box that clips it.
function sampler({ box, columns, rows, alpha }) {
  return (x, y) => {
    if (x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height) return 0;
    const u = ((x - box.x) / box.width) * (columns - 1);
    const v = ((y - box.y) / box.height) * (rows - 1);
    const [c0, r0] = [Math.floor(u), Math.floor(v)];
    const [c1, r1] = [Math.min(c0 + 1, columns - 1), Math.min(r0 + 1, rows - 1)];
    const [fu, fv] = [u - c0, v - r0];
    const at = (c, r) => alpha[r * columns + c] / 255;
    return (
      (at(c0, r0) * (1 - fu) + at(c1, r0) * fu) * (1 - fv) +
      (at(c0, r1) * (1 - fu) + at(c1, r1) * fu) * fv
    );
  };
}

// The panes over one another, as the layout stacks their images.
function composite(samplers) {
  return (x, y) => samplers.reduce((under, sample) => 1 - (1 - under) * (1 - sample(x, y)), 0);
}

describe('the native glass pane rasters', () => {
  // Negative control: spans counted once per shape instead of united overshoot by 0.05 to 0.29
  // wherever shapes overlap.
  it.each(CASES)(
    'follow shipping’s mask for %s',
    (_, toolbar, open, expanded) => {
      for (const shape of glassPaneShapes(toolbar, open, expanded)) {
        const sample = sampler(glassPaneRaster(shape, INK_ALPHA));
        const { box, width, height, mask } = shippingMask(shape);
        let worst = 0;
        for (let row = 0; row < height; row++)
          for (let column = 0; column < width; column++) {
            const shipping = INK_ALPHA * mask[row * width + column];
            const native = sample(box.x + column + 0.5, box.y + row + 0.5);
            worst = Math.max(worst, Math.abs(native - shipping));
          }
        expect(worst).toBeLessThan(MASK_TOLERANCE);
      }
    },
    BRUTE_FORCE_TIMEOUT_MS
  );

  // Negative control: the nine-sliced gradient tiles this replaced, each shape drawn alone and
  // trimmed only to the others' centres, step 0.107 at (46, 750) with seven actions and a menu.
  it.each(CASES)('lay one continuous coat for %s', (_, toolbar, open, expanded) => {
    const shapes = glassPaneShapes(toolbar, open, expanded);
    const panes = shapes.map((shape) => glassPaneRaster(shape, INK_ALPHA));
    const coat = composite(panes.map(sampler));
    // Over the paper: the rail's opaque glass covers what lies past the panes' shared clip.
    const { x: left, y: top, width, height } = shapes[0].clip;
    const [right, bottom] = [left + width, top + height];
    let worst = 0;
    for (let y = top + 0.5; y < bottom; y += 4)
      for (let x = left; x + STEP_PX < right; x += STEP_PX)
        worst = Math.max(worst, Math.abs(coat(x + STEP_PX, y) - coat(x, y)));
    for (let x = left + 0.5; x < right; x += 4)
      for (let y = top; y + STEP_PX < bottom; y += STEP_PX)
        worst = Math.max(worst, Math.abs(coat(x, y + STEP_PX) - coat(x, y)));
    expect(worst).toBeLessThan(STEP_TOLERANCE);
    expect(Math.max(...panes.flatMap(({ alpha }) => Math.max(...alpha)))).toBeLessThanOrEqual(
      Math.round(255 * INK_ALPHA)
    );
  });

  it('carry the raster losslessly in their image', async () => {
    const [shape] = glassPaneShapes(PHONE_SEVEN, 'brush', true);
    const raster = glassPaneRaster(shape, INK_ALPHA);
    const uri = glassPanePng(raster, GLASS_PANE_INKS.light.rgb);
    const png = Buffer.from(uri.replace('data:image/png;base64,', ''), 'base64');
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([raster.columns, raster.rows]);
    const pixels = Array.from(raster.alpha, (_, pixel) => [
      ...data.subarray(pixel * 4, pixel * 4 + 4),
    ]);
    expect(pixels.map((rgba) => rgba[3])).toEqual([...raster.alpha]);
    const inked = pixels.filter((rgba) => rgba[3] > 0).map((rgba) => rgba.slice(0, 3));
    expect(inked.length).toBeGreaterThan(0);
    expect(new Set(inked.map(String))).toEqual(new Set([String(GLASS_PANE_INKS.light.rgb)]));
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
  // that backdrop. A plain colour matches it at every backdrop only if it passes as much of it.
  it.each(['light', 'dark'])('passes and paints what shipping’s %s pane does', (mode) => {
    const frost = parseFloat(scale.glassStrip) / 100;
    const tint = themes[mode].glassTintRgb.split(' ').map((byte) => Number(byte) / 255);
    const grain = PAPER_GRAIN_RGB.map((byte) => byte / 255);
    const ink = GLASS_PANE_INKS[mode];
    const color = ink.rgb.map((byte) => byte / 255);
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
