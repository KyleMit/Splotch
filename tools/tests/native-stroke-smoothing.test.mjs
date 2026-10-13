import { beforeAll, describe, expect, it, vi } from 'vitest';
import { appendSmoothSegments } from '../../web/src/lib/drawing/strokeMath.ts';
import { paintOpShape } from '../../web/src/lib/drawing/opGeometry.ts';
import { strokePath } from '../../experiments/native-architecture/src/drawing/model.ts';
import { crayonPasses } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { paintStroke } from '../../experiments/native-architecture/src/drawing/skiaInkPainter.ts';
import { createCrayonTileResources } from '../../experiments/native-architecture/src/drawing/crayonTiles.ts';
import { LEGACY_PAPER } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

// Native ink against shipping's stroke geometry (issue 2831). Shipping's side is the engine's
// own pipeline: a start dot, then one path op per raster batch built by appendSmoothSegments
// from the pointer's pen, laid down by the shared op painter (paintOpShape). Native's side is
// the SVG path string the web ink draws and the Skia path the native painter draws.

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

let PathVerb;
beforeAll(async () => {
  const state = await runtime;
  const CanvasKitInit = state.require('canvaskit-wasm');
  const { JsiSkApi } = state.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  state.skia = JsiSkApi(await CanvasKitInit());
  ({ PathVerb } = state.require('@shopify/react-native-skia/lib/commonjs/skia/types'));
});

// Sparse input: each leg arrives as three samples, as a fast mouse or finger delivers it.
const SAMPLES_PER_LEG = 3;
// Shipping rasterizes whatever moves arrived since the last frame as one op.
const POINTS_PER_FRAME = 2;
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

// The start dot and path ops shipping's engine records for one stroke, as one curve: each op
// continues from where the one before it ended, so its moveTo is checked and then dropped.
function shippingCurve(points) {
  const [first, ...rest] = points;
  const pen = { x: first.x, y: first.y, midX: first.x, midY: first.y };
  const commands = [];
  let end = null;
  const target = {
    beginPath() {},
    stroke() {},
    fill() {},
    arc(x, y) {
      commands.push(['M', x, y]);
      end = { x, y };
    },
    moveTo(x, y) {
      if (x !== end.x || y !== end.y) throw new Error('A shipping op left a gap in the curve.');
    },
    quadraticCurveTo(cx, cy, x, y) {
      commands.push(['Q', cx, cy, x, y]);
      end = { x, y };
    },
  };
  paintOpShape(target, { kind: 'dot', x: first.x, y: first.y, radius: STROKE_WIDTH / 2 }, '#000');
  for (let index = 0; index < rest.length; index += POINTS_PER_FRAME) {
    const op = {
      kind: 'path',
      startX: pen.midX,
      startY: pen.midY,
      segs: [],
      lineWidth: STROKE_WIDTH,
    };
    appendSmoothSegments(pen, rest.slice(index, index + POINTS_PER_FRAME), op.segs);
    paintOpShape(target, op, '#000');
  }
  return commands;
}

function svgCommands(path) {
  return [...path.matchAll(/([MQL])([^MQL]*)/g)].map(([, verb, args]) => [
    verb,
    ...args.trim().split(/\s+/).map(Number),
  ]);
}

// Skia stores path coordinates as 32-bit floats.
function float32(commands) {
  return commands.map(([verb, ...values]) => [verb, ...values.map(Math.fround)]);
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

// A later pass's own moveTo is where the earlier pass ended, or the joined curve has a gap.
function joinPasses(curves) {
  return curves.flatMap(([move, ...curve], index) => {
    if (!index) return [move, ...curve];
    expect(move.slice(1)).toEqual(curves[index - 1].at(-1).slice(-2));
    return curve;
  });
}

describe('native strokes follow shipping smoothing', () => {
  it.each([
    ['zigzag', ZIGZAG],
    ['scribble', SCRIBBLE],
  ])('draws the %s web SVG path shipping draws', (_name, points) => {
    expect(svgCommands(strokePath(points))).toEqual(shippingCurve(points));
  });

  it('draws the zigzag Skia pen path shipping draws', () => {
    const paths = recordedSkiaPaths({ brush: 'pen', color: 'Blue', width: 8, points: ZIGZAG });
    expect(paths).toEqual([float32(shippingCurve(ZIGZAG))]);
  });

  it('joins crayon passes into the one curve shipping draws across its pass splits', () => {
    const passes = crayonPasses(SCRIBBLE_CRAYON, STROKE_WIDTH);
    expect(passes.length).toBeGreaterThan(2);
    const curves = passes.map((pass) => svgCommands(strokePath(pass.points, pass.lead)));
    expect(joinPasses(curves)).toEqual(shippingCurve(SCRIBBLE));
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
    expect(joinPasses(curves)).toEqual(float32(shippingCurve(SCRIBBLE)));
  });
});
