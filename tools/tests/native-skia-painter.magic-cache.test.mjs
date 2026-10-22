import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  adoptPaper,
  paperBounds,
  paperProjection,
  paperSize,
} from '../../src/drawing/paperSpace.ts';
import { COLORING_FILLS } from '../../src/drawing/pages.ts';

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

const PAINTER = fileURLToPath(new URL('../../src/drawing/skiaInkPainter.ts', import.meta.url));
const PAINT_TIMEOUT_MS = 30_000;
const REPEATED_PAINTS = 3;

let skia;
beforeAll(async () => {
  const CanvasKitInit = runtime.require('canvaskit-wasm');
  const { JsiSkApi } = runtime.require('@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia');
  runtime.skia = skia = JsiSkApi(await CanvasKitInit());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A painter module with nothing cached yet: its first paint takes the uncached path.
async function freshPainter() {
  vi.resetModules();
  return import(PAINTER);
}

const portrait = adoptPaper(390, 704, 1);
const PORTRAIT = paperProjection(portrait);
// Frames and papers in which most steps change one paper-bounds field alone (the pixel test
// checks each claim), so a cache key missing any one field misses a rebuild at that step. A frame
// change resizes the bounds; only a paper whose rounded semantic size letterboxes differently
// moves x or y, by a fraction of a unit.
const BOUNDS_STEPS = [
  ['resize', paperProjection(portrait, { width: 520, height: 704 }), ['x', 'width']],
  ['width-only resize', paperProjection(portrait, { width: 540, height: 704 }), ['width']],
  ['height-only resize', paperProjection(portrait, { width: 540, height: 760 }), ['height']],
  ['x-only paper', paperProjection(adoptPaper(396, 704, 1), { width: 540, height: 760 }), ['x']],
  ['rotation', paperProjection(portrait, { width: 704, height: 390 }), ['x', 'width', 'height']],
  [
    'landscape paper',
    paperProjection(adoptPaper(782, 391, 1), { width: 760, height: 540 }),
    ['x', 'width', 'height'],
  ],
  ['y-only paper', paperProjection(adoptPaper(782, 412, 1), { width: 760, height: 540 }), ['y']],
].map(([label, projection, changes]) => ({ label, projection, changes }));
const LAST_BOUNDS = BOUNDS_STEPS.at(-1).projection;

function fillImage(stripe) {
  const surface = skia.Surface.Make(48, 64);
  const canvas = surface.getCanvas();
  canvas.drawColor(skia.Color('#f4d35e'));
  const paint = skia.Paint();
  paint.setColor(skia.Color(stripe));
  for (let x = 0; x < 48; x += 12) canvas.drawRect(skia.XYWHRect(x, 0, 6, 64), paint);
  return surface.makeImageSnapshot();
}

function context({ projection = PORTRAIT, theme = 'light', pageId = 'sunshine', bookFill = null }) {
  return {
    paper: projection.paper,
    projection,
    theme,
    pageId,
    tiles: { byKey: new Map(), uris: [] },
    bookFill,
  };
}

// A zigzag across the whole paper, so it crosses every region, band and background.
function scribble(projection) {
  const { width, height } = paperSize(projection.paper);
  const points = Array.from({ length: 13 }, (_, index) => ({
    x: index % 2 === 0 ? width * 0.05 : width * 0.95,
    y: (height * index) / 12,
  }));
  return { brush: 'magic', rainbow: 0, width: 60, points };
}

function paintedPixels(painter, paintContext) {
  const bounds = paperBounds(paintContext.projection);
  const surface = skia.Surface.Make(Math.ceil(bounds.width), Math.ceil(bounds.height));
  const canvas = surface.getCanvas();
  canvas.translate(-bounds.x, -bounds.y);
  painter.paintStroke(canvas, scribble(paintContext.projection), paintContext);
  return surface.makeImageSnapshot().readPixels(0, 0, {
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
    colorType: 4,
    alphaType: 2,
  });
}

// Every input the painter's Magic shader key compares, with the fill image by identity.
function cacheInputs({ projection, theme = 'light', pageId = 'sunshine', bookFill = null }) {
  return { pageId, theme, image: bookFill, ...paperBounds(projection) };
}

function changedFields(before, after) {
  return Object.keys(after).filter((key) => !Object.is(before[key], after[key]));
}

// Booleans and counts only: a failure diff would otherwise serialize megabytes of pixels.
function differingBytes(a, b) {
  if (a.length !== b.length) return Infinity;
  let count = 0;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) count++;
  return count;
}

it(
  'paints each repeated or changed Magic fill with the uncached path’s exact pixels',
  async () => {
    const stripesA = fillImage('#2a9d8f');
    const stripesB = fillImage('#e76f51');
    const flower = { theme: 'dark', pageId: 'flower' };
    const book = { theme: 'dark', pageId: 'blank', bookFill: stripesB };
    const sequence = [
      { label: 'first sample-page paint', projection: PORTRAIT, changes: null },
      { label: 'repeat', projection: PORTRAIT, changes: [] },
      { label: 'theme switch', projection: PORTRAIT, theme: 'dark', changes: ['theme'] },
      { label: 'page switch', projection: PORTRAIT, ...flower, changes: ['pageId'] },
      ...BOUNDS_STEPS.map((step) => ({ ...step, ...flower })),
      {
        label: 'book fill',
        projection: LAST_BOUNDS,
        ...book,
        bookFill: stripesA,
        changes: ['pageId', 'image'],
      },
      { label: 'book repeat', projection: LAST_BOUNDS, ...book, bookFill: stripesA, changes: [] },
      { label: 'new fill decode', projection: LAST_BOUNDS, ...book, changes: ['image'] },
      { label: 'book portrait', projection: PORTRAIT, ...book, changes: ['y', 'width', 'height'] },
      ...BOUNDS_STEPS.map((step) => ({ ...step, ...book, label: `book ${step.label}` })),
    ];
    const warm = await import(PAINTER);
    const painted = [];
    let previous = null;
    for (const step of sequence) {
      const cached = paintedPixels(warm, context(step));
      const uncached = paintedPixels(await freshPainter(), context(step));
      painted.push({
        step: step.label,
        changes: previous && changedFields(previous.inputs, cacheInputs(step)),
        differing: differingBytes(cached, uncached),
        changed: previous === null || differingBytes(previous.pixels, uncached) > 0,
      });
      previous = { inputs: cacheInputs(step), pixels: uncached };
    }
    // Each change must alter the pixels, or a cache that ignored it would still pass.
    expect(painted).toEqual(
      sequence.map((step) => ({
        step: step.label,
        changes: step.changes,
        differing: 0,
        changed: step.changes === null || step.changes.length > 0,
      }))
    );
  },
  PAINT_TIMEOUT_MS
);

// The x-only and y-only steps shift the fill by under a quarter unit, which leaves CanvasKit's
// raster output unchanged, so only a count of recordings shows a key that drops x or y.
it('records a fill once per distinct input and parses each page’s regions once', async () => {
  const painter = await freshPainter();
  const parse = vi.spyOn(skia.Path, 'MakeFromSVGString');
  const record = vi.spyOn(skia, 'PictureRecorder');
  const canvas = skia.Surface.Make(64, 64).getCanvas();
  const turtle = { pageId: 'turtle', theme: 'dark' };
  const book = { pageId: 'blank', theme: 'dark', bookFill: fillImage('#2a9d8f') };
  const steps = [
    { projection: PORTRAIT, pageId: 'turtle' },
    { projection: PORTRAIT, ...turtle },
    ...BOUNDS_STEPS.map((step) => ({ ...step, ...turtle })),
    { projection: LAST_BOUNDS, ...book },
    { projection: LAST_BOUNDS, ...book, bookFill: fillImage('#2a9d8f') },
    { projection: PORTRAIT, ...book },
    ...BOUNDS_STEPS.map((step) => ({ ...step, ...book })),
  ];
  const recordings = steps.map((step) => {
    for (let repeat = 0; repeat < REPEATED_PAINTS; repeat++)
      painter.paintStroke(canvas, scribble(step.projection), context(step));
    return record.mock.calls.length;
  });
  expect(recordings).toEqual(steps.map((_, index) => index + 1));
  expect(parse).toHaveBeenCalledTimes(COLORING_FILLS.turtle.regions.length);
  painter.paintStroke(canvas, scribble(PORTRAIT), context({ pageId: 'flower' }));
  expect(parse).toHaveBeenCalledTimes(
    COLORING_FILLS.turtle.regions.length + COLORING_FILLS.flower.regions.length
  );
});
