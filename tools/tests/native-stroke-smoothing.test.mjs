import { beforeAll, describe, expect, it, vi } from 'vitest';
import goldenPaths from './native-stroke-paths.fixture.json';

import { strokePath } from '../../src/drawing/model.ts';
import { crayonPasses } from '../../src/drawing/crayon.ts';
import { paintStroke } from '../../src/drawing/skiaInkPainter.ts';
import { createCrayonTileResources } from '../../src/drawing/crayonTiles.ts';
import { LEGACY_PAPER } from '../../src/drawing/paperSpace.ts';

// SVG and Skia paths share the canonical quadratic grid and meet at each crayon pass boundary.

// Awaited so this import settles before the static imports start: a concurrent import can take
// Vitest's pending-mock queue, and a slow mock resolve then lets the painter load real Skia.
const runtime = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module');
  return { skia: null, require: createRequire(import.meta.url) };
});

// Skia's own web API over CanvasKit stands in for its native module, which Node cannot load.
vi.mock('@shopify/react-native-skia', () => ({
  ...runtime.require('@shopify/react-native-skia/lib/commonjs/skia/types'),
  get Skia() {
    return runtime.skia;
  },
}));

let PathVerb;
beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = JsiSkApi(await CanvasKitInit());
  ({ PathVerb } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/types'));
});

// Sparse input: each leg arrives as three samples, as a fast mouse or finger delivers it.
const SAMPLES_PER_LEG = 3;
const STROKE_WIDTH = 12;

function paperRound(value) {
  return Math.round(value * 100) / 100;
}

function sparse(vertices) {
  const points = [vertices[0]];
  for (const [index, to] of vertices.slice(1).entries()) {
    const from = vertices[index];
    for (let step = 1; step <= SAMPLES_PER_LEG; step++) {
      const t = step / SAMPLES_PER_LEG;
      points.push({
        x: paperRound(from.x + (to.x - from.x) * t),
        y: paperRound(from.y + (to.y - from.y) * t),
      });
    }
  }
  return points;
}
const ZIGZAG = sparse(
  Array.from({ length: 9 }, (_, index) => ({ x: 100 + index * 70, y: index % 2 ? 420 : 180 }))
);
// Doubling back past its own strip splits a crayon stroke into several deposition passes.
const SCRIBBLE = sparse([
  { x: 100, y: 300 },
  { x: 700, y: 320 },
  { x: 140, y: 345 },
  { x: 690, y: 370 },
  { x: 120, y: 400 },
]);

function svgCommands(path) {
  return [...path.matchAll(/([MQL])([^MQL]*)/g)].map(([, verb, args]) => [
    verb,
    ...args.trim().split(/\s+/).map(Number),
  ]);
}

function skiaCommands(path) {
  const letters = { [PathVerb.Move]: 'M', [PathVerb.Line]: 'L', [PathVerb.Quad]: 'Q' };
  return path.toCmds().map(([verb, ...values]) => {
    if (!(verb in letters)) throw new Error(`Unexpected Skia verb ${verb}`);
    return [letters[verb], ...values];
  });
}

function recordedSkiaPaths(stroke) {
  const paths = [];
  const canvas = {
    drawPath(path) {
      paths.push(skiaCommands(path));
    },
    drawCircle() {
      throw new Error('A multi-point stroke drew a dot.');
    },
    saveLayer() {},
    restore() {},
  };
  const tiles = createCrayonTileResources()([stroke], 'light');
  paintStroke(canvas, stroke, {
    paper: LEGACY_PAPER,
    theme: 'light',
    pageId: 'blank',
    tiles,
    bookFill: null,
  });
  return paths;
}

const SCRIBBLE_CRAYON = {
  brush: 'crayon',
  color: 'Red',
  width: STROKE_WIDTH,
  seed: 3,
  points: SCRIBBLE,
};

function joinPasses(curves) {
  return curves.flatMap(([move, ...curve], index) => {
    if (!index) return [move, ...curve];
    expect(move.slice(1)).toEqual(curves[index - 1].at(-1).slice(-2));
    return curve;
  });
}
function float32(curve) {
  return curve.map(([verb, ...values]) => [verb, ...values.map(Math.fround)]);
}
describe('native stroke smoothing agrees across renderers', () => {
  it('joins crayon passes into the one curve shipping draws across its pass splits', () => {
    const passes = crayonPasses(SCRIBBLE_CRAYON, STROKE_WIDTH);
    expect(passes.length).toBeGreaterThan(2);
    const curves = passes.map((pass) => svgCommands(strokePath(pass.points, pass.lead)));
    expect(joinPasses(curves)).toEqual(svgCommands(strokePath(SCRIBBLE)));
  });

  it('draws each crayon pass on Skia from where the previous pass ended', () => {
    const passes = crayonPasses(SCRIBBLE_CRAYON, STROKE_WIDTH);
    const paths = recordedSkiaPaths(SCRIBBLE_CRAYON);
    const perPass = paths.length / passes.length;
    const curves = passes.map((_, index) => {
      const own = paths.slice(index * perPass, (index + 1) * perPass);
      for (const band of own) expect(band).toEqual(own[0]);
      return own[0];
    });
    expect(joinPasses(curves)).toEqual(float32(svgCommands(strokePath(SCRIBBLE))));
  });
});

it.each([
  ['zigzag', ZIGZAG],
  ['scribble', SCRIBBLE],
])('draws the %s SVG path on the canonical quadratic grid', (name, points) => {
  expect(svgCommands(strokePath(points))).toEqual(goldenPaths[name]);
});
it('draws the zigzag Skia pen path on the canonical quadratic grid', () => {
  expect(recordedSkiaPaths({ brush: 'pen', color: 'Blue', width: 8, points: ZIGZAG })).toEqual([
    float32(goldenPaths.zigzag),
  ]);
});
