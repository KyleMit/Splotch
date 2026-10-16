import { beforeAll, expect, it, vi } from 'vitest';
import {
  DECODED_IMAGE_LIMIT,
  decodeDataUriImage,
  paintStroke,
} from '../../experiments/native-architecture/src/drawing/skiaInkPainter.ts';
import {
  adoptPaper,
  paperSize,
  paperProjection,
  LEGACY_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { COLORING_FILLS } from '../../experiments/native-architecture/src/drawing/pages.ts';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';
import { createCrayonTileResources } from '../../experiments/native-architecture/src/drawing/crayonTiles.ts';
import { makeSkiaUndoGhost } from '../../experiments/native-architecture/src/drawing/skiaUndoGhostImage.ts';
import {
  undoGhostBounds,
  undoGhostStrokes,
} from '../../experiments/native-architecture/src/drawing/undoGhostGeometry.ts';

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

let skia;
beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = skia = JsiSkApi(await CanvasKitInit());
});

const SIZE = 64;
const context = {
  paper: LEGACY_PAPER,
  projection: paperProjection(LEGACY_PAPER),
  theme: 'light',
  pageId: 'blank',
  tiles: { byKey: new Map(), uris: [] },
  bookFill: null,
};

function solidPngUri(red) {
  const surface = skia.Surface.Make(2, 2);
  surface.getCanvas().drawColor(skia.Color(`rgb(${red}, 0, 0)`));
  return `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
}

function alphaAt(surface, x, y) {
  return surface.makeImageSnapshot().readPixels(x, y, {
    width: 1,
    height: 1,
    colorType: 4,
    alphaType: 2,
  })[3];
}

// Skia warns once per deprecated method per process, so this must paint before any other test.
it('builds stroke paths without the deprecated SkPath mutators', () => {
  const warn = vi.spyOn(console, 'warn');
  const surface = skia.Surface.Make(SIZE, SIZE);
  const curve = [
    { x: 4, y: 4 },
    { x: 32, y: 60 },
    { x: 60, y: 4 },
  ];
  paintStroke(
    surface.getCanvas(),
    { brush: 'pen', color: 'Red', width: 8, points: curve },
    context
  );
  expect(warn.mock.calls.flat().filter((message) => /deprecated/.test(message))).toEqual([]);
  expect(alphaAt(surface, 4, 4)).toBe(255);
  warn.mockRestore();
});

it('keeps recently decoded textures and evicts beyond its limit', () => {
  const uris = Array.from({ length: DECODED_IMAGE_LIMIT + 1 }, (_, index) => solidPngUri(index));
  const first = decodeDataUriImage(uris[0]);
  // Identity as booleans: a failure diff would otherwise serialize CanvasKit's heap.
  expect(decodeDataUriImage(uris[0]) === first).toBe(true);
  for (const uri of uris.slice(1)) decodeDataUriImage(uri);
  expect(decodeDataUriImage(uris[0]) === first).toBe(false);
  const last = decodeDataUriImage(uris.at(-1));
  expect(decodeDataUriImage(uris.at(-1)) === last).toBe(true);
});

it('lays pen ink and lets the eraser clear it on the ink layer', () => {
  const surface = skia.Surface.Make(SIZE, SIZE);
  const canvas = surface.getCanvas();
  const across = [
    { x: 4, y: 32 },
    { x: 60, y: 32 },
  ];
  paintStroke(canvas, { brush: 'pen', color: 'Purple', width: 8, points: across }, context);
  expect(alphaAt(surface, 32, 32)).toBe(255);
  expect(alphaAt(surface, 32, 4)).toBe(0);
  const down = [
    { x: 32, y: 4 },
    { x: 32, y: 60 },
  ];
  paintStroke(canvas, { brush: 'eraser', width: 16, points: down }, context);
  expect(alphaAt(surface, 32, 32)).toBe(0);
  expect(alphaAt(surface, 8, 32)).toBe(255);
});

function colorAt(surface, x, y) {
  const [red, green, blue] = surface.makeImageSnapshot().readPixels(x, y, {
    width: 1,
    height: 1,
    colorType: 4,
    alphaType: 2,
  });
  return '#' + [red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('');
}

it('reveals a sample page Magic fill fitted and centered on a portrait paper', () => {
  // A 390x704 paper area adopts a 567x1024 semantic paper; the sun sits at its middle.
  const paper = adoptPaper(390, 704, 1);
  const { width, height } = paperSize(paper);
  const surface = skia.Surface.Make(width, height);
  const down = Array.from({ length: 11 }, (_, index) => ({ x: width / 2, y: index * 100 }));
  paintStroke(
    surface.getCanvas(),
    { brush: 'magic', rainbow: 0, width: 44, points: down },
    { ...context, paper, projection: paperProjection(paper), pageId: 'sunshine' }
  );
  const fill = COLORING_FILLS.sunshine;
  const sun = paletteHex(fill.regions[0].colors.light).toLowerCase();
  const sky = paletteHex(fill.background.light).toLowerCase();
  expect(colorAt(surface, Math.floor(width / 2), height / 2)).toBe(sun);
  expect(colorAt(surface, Math.floor(width / 2), 100)).toBe(sky);
  expect(colorAt(surface, Math.floor(width / 2), height - 100)).toBe(sky);
});

const GHOST_PLANE = { width: 1024, height: 768 };
function ghostFixture(brush = 'pen') {
  const removed =
    brush === 'magic'
      ? { brush, rainbow: 0, width: 16, points: [{ x: 32, y: 32 }] }
      : brush === 'crayon'
        ? { brush, color: 'Green', seed: 1, width: 16, points: [{ x: 32, y: 32 }] }
        : { brush, color: 'Green', width: 16, points: [{ x: 32, y: 32 }] };
  const before = { version: 5, pageId: 'blank', rainbow: 0, strokes: [removed] };
  return {
    id: 1,
    startedAt: 0,
    reduced: false,
    towards: null,
    onFinished: vi.fn(),
    before,
    after: { ...before, strokes: [] },
  };
}
function imagePixel(image, x, y) {
  return [...image.readPixels(x, y, { width: 1, height: 1, colorType: 4, alphaType: 2 })];
}
function imageAlpha(image, x, y) {
  return imagePixel(image, x, y)[3];
}

it('builds a bounded pen ghost from only the removed cohort with the renderer’s exact pixels', () => {
  const feedback = ghostFixture();
  const before = skia.Surface.Make(GHOST_PLANE.width, GHOST_PLANE.height);
  paintStroke(before.getCanvas(), feedback.before.strokes[0], context);
  const live = before.makeImageSnapshot();
  const bounds = undoGhostBounds(feedback, GHOST_PLANE, 1);
  expect(bounds).toEqual({ left: 22, top: 22, width: 20, height: 20 });
  const ghost = makeSkiaUndoGhost({
    before: live,
    after: null,
    removed: undoGhostStrokes(feedback),
    context,
    bounds,
    size: GHOST_PLANE,
    density: 1,
  });
  expect(ghost.width()).toBe(20);
  expect(ghost.height()).toBe(20);
  expect(imageAlpha(ghost, 10, 10)).toBe(255);
  expect(imageAlpha(ghost, 0, 0)).toBe(0);
  expect(imagePixel(ghost, 10, 10)).toEqual(imagePixel(live, 32, 32));
});

it.each(['crayon', 'magic'])(
  'copies %s live pixels inside its footprint and subtracts surviving ink alpha',
  (brush) => {
    const feedback = ghostFixture(brush);
    const before = skia.Surface.Make(GHOST_PLANE.width, GHOST_PLANE.height);
    const after = skia.Surface.Make(GHOST_PLANE.width, GHOST_PLANE.height);
    const rasterContext = {
      ...context,
      tiles: createCrayonTileResources()(feedback.before.strokes, context.theme),
    };
    const stroke = feedback.before.strokes[0];
    paintStroke(before.getCanvas(), stroke, rasterContext);
    const paint = skia.Paint();
    paint.setColor(skia.Color('green'));
    before.getCanvas().drawCircle(40, 40, 2, paint);
    const live = before.makeImageSnapshot();
    const center = stroke.points[0];
    const coreRadius = stroke.width / 2 - 2;
    const core = [];
    for (let y = center.y - coreRadius; y <= center.y + coreRadius; y++)
      for (let x = center.x - coreRadius; x <= center.x + coreRadius; x++)
        if (Math.hypot(x - center.x, y - center.y) <= coreRadius) core.push({ x, y });
    const wax = core.filter(({ x, y }) => imageAlpha(live, x, y) === 255);
    expect(wax.length).toBeGreaterThan(0);
    expect(wax.length < core.length).toBe(brush === 'crayon');
    const surviving = wax[0];
    const departing = wax.find(({ x, y }) => Math.hypot(x - surviving.x, y - surviving.y) > 4);
    expect(departing).toBeDefined();
    after.getCanvas().drawCircle(surviving.x, surviving.y, 2, paint);
    const bounds = undoGhostBounds(feedback, GHOST_PLANE, 1);
    expect(bounds).toEqual({ left: 22, top: 22, width: 20, height: 20 });
    const ghost = makeSkiaUndoGhost({
      before: live,
      after: after.makeImageSnapshot(),
      removed: undoGhostStrokes(feedback),
      context: rasterContext,
      bounds,
      size: GHOST_PLANE,
      density: 1,
    });
    expect(imageAlpha(ghost, surviving.x - bounds.left, surviving.y - bounds.top)).toBe(0);
    expect(imageAlpha(ghost, departing.x - bounds.left, departing.y - bounds.top)).toBe(255);
    expect(imageAlpha(ghost, 18, 18)).toBe(0);
    expect(imagePixel(ghost, departing.x - bounds.left, departing.y - bounds.top)).toEqual(
      imagePixel(live, departing.x, departing.y)
    );
  }
);

it.each(['reduced', 'eraser', 'clear', 'page', 'replacement'])(
  'omits the shipping %s Undo ghost',
  (kind) => {
    const feedback = ghostFixture();
    if (kind === 'reduced') feedback.reduced = true;
    if (kind === 'eraser')
      feedback.before.strokes[0] = { brush: 'eraser', width: 16, points: [{ x: 32, y: 32 }] };
    if (kind === 'clear') [feedback.before, feedback.after] = [feedback.after, feedback.before];
    if (kind === 'page') feedback.after = { ...feedback.before, pageId: 'sunshine' };
    if (kind === 'replacement')
      feedback.after = { ...feedback.before, strokes: [{ ...feedback.before.strokes[0] }] };
    expect(undoGhostStrokes(feedback)).toEqual([]);
    expect(undoGhostBounds(feedback, GHOST_PLANE, 1)).toBeNull();
  }
);

it('bounds the same midpoint path the live renderer paints and pads it in physical pixels', () => {
  const feedback = ghostFixture();
  feedback.before.strokes[0] = {
    ...feedback.before.strokes[0],
    points: [
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ],
  };
  expect(undoGhostBounds(feedback, GHOST_PLANE, 1)).toEqual({
    left: 0,
    top: 0,
    width: 60,
    height: 60,
  });
  expect(undoGhostBounds(feedback, GHOST_PLANE, 2)).toEqual({
    left: 1,
    top: 1,
    width: 58,
    height: 58,
  });
});
