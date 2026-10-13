import { beforeAll, describe, expect, it, vi } from 'vitest';
import { paintStroke } from '../../experiments/native-architecture/src/drawing/skiaInkPainter.ts';
import { createCrayonTileResources } from '../../experiments/native-architecture/src/drawing/crayonTiles.ts';
import {
  CRAYON_BANDS,
  CRAYON_COLOR_MIX,
} from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { paintAppearance } from '../../experiments/native-architecture/src/drawing/palette.ts';
import { LEGACY_PAPER } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

// Native Crayon against the crayon ADRs (0065, 0067), measured on Skia's own pixels. The
// thresholds come from the issue-2759 comparison against the shipping web crayon at a matched
// texel scale (twelve seeds per side): a single pass covered 0.66–0.69 of the stroke body, a
// second same-colour pass 0.87–0.88, and 60–68% of the wax where two colours cross was the mixed
// colour.

const runtime = vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return { skia: null, require: createRequire(import.meta.url) };
});

// Skia's own web API over CanvasKit stands in for its native module, which Node cannot load.
vi.mock('@shopify/react-native-skia', async () => {
  const state = await runtime;
  return {
    ...state.require('@shopify/react-native-skia/lib/commonjs/skia/types'),
    get Skia() {
      return state.skia;
    },
  };
});

let skia;
beforeAll(async () => {
  const state = await runtime;
  const CanvasKitInit = state.require('canvaskit-wasm');
  const { JsiSkApi } = state.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  state.skia = skia = JsiSkApi(await CanvasKitInit());
});

const SURFACE = { width: 300, height: 240 };
const STROKE_WIDTH = 22;
const AXIS = 120;
// A legacy paper maps one semantic unit to one pixel and one crayon texel, so the stroke spans
// the same number of texels as the web crayon at a matched backing scale.
const PAPER = LEGACY_PAPER;
const BODY = {
  x0: 60,
  x1: 240,
  y0: AXIS - 0.4 * STROKE_WIDTH,
  y1: AXIS + 0.4 * STROKE_WIDTH,
};
// Inside the narrowest band, less one pixel of its antialiased edge: an edge pixel's partial
// coverage compounds on every paint, on the web pass buffer as here, so only the tooth is binary.
const CORE_HALF_WIDTH =
  (STROKE_WIDTH * Math.min(...CRAYON_BANDS.map((band) => band.widthScale))) / 2 - 1;
const CORE = { ...BODY, y0: AXIS - CORE_HALF_WIDTH, y1: AXIS + CORE_HALF_WIDTH };
const CROSSING = {
  x0: 150 - 0.3 * STROKE_WIDTH,
  x1: 150 + 0.3 * STROKE_WIDTH,
  y0: AXIS - 0.3 * STROKE_WIDTH,
  y1: AXIS + 0.3 * STROKE_WIDTH,
};
// Wax is binary, so anything above half alpha is a deposited texel; the antialiased stroke rim
// lies outside BODY.
const WAX_ALPHA = 128;

// One pass must leave paper tooth showing; a solid marker fill covers the whole body.
const MAX_SINGLE_PASS_COVERAGE = 0.9;
// Below this a stroke reads as scattered specks rather than a crayon line.
const MIN_SINGLE_PASS_COVERAGE = 0.4;
// Web's second pass added 0.22 of the body on average. A re-phase failure adds nothing.
const MIN_SECOND_PASS_GAIN = 0.1;
// ADR-0065's constant-hue bound, shared with web/tests/engine-crayon.spec.ts: the per-texel shade
// variation moves a band's mean colour a few levels between passes, while a translucent or
// multiplied glaze darkens same-colour overdraw by tens.
const MAX_BUILDUP_CHANNEL_DRIFT = 10;
// Half the web crossing's mean mixed share: mixing that stops entirely measures zero.
const MIN_MIXED_SHARE = 0.3;

function line(x0, y0, x1, y1) {
  const steps = Math.round(Math.hypot(x1 - x0, y1 - y0) / 4);
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: x0 + ((x1 - x0) * index) / steps,
    y: y0 + ((y1 - y0) * index) / steps,
  }));
}

const ALONG = line(20, AXIS, 280, AXIS);
const ACROSS = { under: line(40, AXIS, 260, AXIS), over: line(150, 10, 150, 230) };

function crayon(color, seed, points) {
  return { brush: 'crayon', color, width: STROKE_WIDTH, seed, points };
}

function render(strokes, theme = 'light') {
  const tiles = createCrayonTileResources()(strokes, theme);
  const context = { paper: PAPER, theme, pageId: 'blank', tiles, bookFill: null };
  const surface = skia.Surface.Make(SURFACE.width, SURFACE.height);
  for (const stroke of strokes) paintStroke(surface.getCanvas(), stroke, context);
  surface.flush();
  return surface.makeImageSnapshot().readPixels(0, 0, {
    width: SURFACE.width,
    height: SURFACE.height,
    colorType: 4,
    alphaType: 3,
  });
}

function pixelsIn(pixels, box) {
  const found = [];
  for (let y = Math.round(box.y0); y < Math.round(box.y1); y++)
    for (let x = Math.round(box.x0); x < Math.round(box.x1); x++) {
      const offset = (y * SURFACE.width + x) * 4;
      found.push([...pixels.slice(offset, offset + 4)]);
    }
  return found;
}

function wax(pixels, box) {
  const all = pixelsIn(pixels, box);
  const deposited = all.filter((pixel) => pixel[3] > WAX_ALPHA);
  const mean = [0, 1, 2].map(
    (channel) => deposited.reduce((sum, pixel) => sum + pixel[channel], 0) / deposited.length
  );
  return { coverage: deposited.length / all.length, mean, deposited };
}

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

// Per crossing texel: the under wax showing through a pit, the over wax on bare paper, or the
// ADR-0065 glaze (1 - m)·S + m·min(S, D).
function crossingShares(pixels, underHex, overHex) {
  const under = rgb(underHex);
  const over = rgb(overHex);
  const mixed = over.map(
    (channel, index) =>
      (1 - CRAYON_COLOR_MIX) * channel + CRAYON_COLOR_MIX * Math.min(channel, under[index])
  );
  const nearest = (pixel) =>
    [
      ['under', under],
      ['over', over],
      ['mixed', mixed],
    ].reduce((best, candidate) =>
      Math.hypot(...candidate[1].map((value, index) => value - pixel[index])) <
      Math.hypot(...best[1].map((value, index) => value - pixel[index]))
        ? candidate
        : best
    )[0];
  const { deposited } = wax(pixels, CROSSING);
  const mixedPixels = deposited.filter((pixel) => nearest(pixel) === 'mixed');
  return {
    mixedShare: mixedPixels.length / deposited.length,
    mixedMean: [0, 1, 2].map(
      (channel) => mixedPixels.reduce((sum, pixel) => sum + pixel[channel], 0) / mixedPixels.length
    ),
  };
}

describe('native Crayon matches the crayon ADRs', () => {
  it('keeps paper tooth in one pass and builds up at a constant hue over repeated passes', () => {
    const passes = [1, 2, 3].map((count) =>
      wax(
        render(Array.from({ length: count }, (_, index) => crayon('Red', index + 1, ALONG))),
        BODY
      )
    );
    expect(passes[0].coverage).toBeGreaterThan(MIN_SINGLE_PASS_COVERAGE);
    expect(passes[0].coverage).toBeLessThan(MAX_SINGLE_PASS_COVERAGE);
    expect(passes[1].coverage - passes[0].coverage).toBeGreaterThan(MIN_SECOND_PASS_GAIN);
    expect(passes[2].coverage).toBeGreaterThan(passes[1].coverage);
    for (const later of passes.slice(1))
      for (const channel of [0, 1, 2])
        expect(Math.abs(later.mean[channel] - passes[0].mean[channel])).toBeLessThan(
          MAX_BUILDUP_CHANNEL_DRIFT
        );
  });

  it('builds up only by re-phasing: the same pass drawn twice is byte-identical', () => {
    const once = pixelsIn(render([crayon('Red', 1, ALONG)]), CORE);
    const twice = pixelsIn(render([crayon('Red', 1, ALONG), crayon('Red', 1, ALONG)]), CORE);
    expect(twice.filter((pixel, index) => pixel.join() !== once[index].join()).length).toBe(0);
  });

  it.each([
    ['Blue', 'Yellow'],
    ['Yellow', 'Blue'],
  ])('mixes %s over %s where the strokes cross', (overColor, underColor) => {
    const pixels = render([crayon(underColor, 1, ACROSS.under), crayon(overColor, 2, ACROSS.over)]);
    const shares = crossingShares(
      pixels,
      paintAppearance(underColor, 'light').hex,
      paintAppearance(overColor, 'light').hex
    );
    expect(shares.mixedShare).toBeGreaterThan(MIN_MIXED_SHARE);
    // The subtractive glaze keeps the green both pigments reflect: the mix leans green.
    expect(shares.mixedMean[1]).toBeGreaterThan(shares.mixedMean[2]);
  });

  it('mixes the dark-paper white crayon into the ink it crosses', () => {
    const pixels = render(
      [crayon('Blue', 1, ACROSS.under), crayon('Black', 2, ACROSS.over)],
      'dark'
    );
    const shares = crossingShares(
      pixels,
      paintAppearance('Blue', 'dark').hex,
      paintAppearance('Black', 'dark').hex
    );
    expect(shares.mixedShare).toBeGreaterThan(MIN_MIXED_SHARE);
  });
});
