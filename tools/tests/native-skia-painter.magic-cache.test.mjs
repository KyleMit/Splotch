import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  adoptPaper,
  paperBounds,
  paperProjection,
  paperSize,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { COLORING_FILLS } from '../../experiments/native-architecture/src/drawing/pages.ts';

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

const PAINTER = fileURLToPath(
  new URL('../../experiments/native-architecture/src/drawing/skiaInkPainter.ts', import.meta.url)
);
const PAINT_TIMEOUT_MS = 30_000;

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
// The same paper in a wider frame, as after a resize, and turned: its bounds gain bands.
const WIDER = paperProjection(portrait, { width: 520, height: 704 });
const ROTATED = paperProjection(portrait, { width: 704, height: 390 });

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
    const sequence = [
      { label: 'first sample-page paint', projection: PORTRAIT },
      { label: 'repeat', projection: PORTRAIT, repeat: true },
      { label: 'theme switch', projection: PORTRAIT, theme: 'dark' },
      { label: 'page switch', projection: PORTRAIT, theme: 'dark', pageId: 'flower' },
      { label: 'resize', projection: WIDER, theme: 'dark', pageId: 'flower' },
      { label: 'rotation', projection: ROTATED, theme: 'dark', pageId: 'flower' },
      { label: 'book fill', projection: ROTATED, pageId: 'blank', bookFill: stripesA },
      {
        label: 'book repeat',
        projection: ROTATED,
        pageId: 'blank',
        bookFill: stripesA,
        repeat: true,
      },
      { label: 'new fill decode', projection: ROTATED, pageId: 'blank', bookFill: stripesB },
      { label: 'book resize', projection: WIDER, pageId: 'blank', bookFill: stripesB },
    ];
    const warm = await import(PAINTER);
    const painted = [];
    let previous = null;
    for (const step of sequence) {
      const cached = paintedPixels(warm, context(step));
      const uncached = paintedPixels(await freshPainter(), context(step));
      painted.push({
        step: step.label,
        differing: differingBytes(cached, uncached),
        changed: previous === null || differingBytes(previous, uncached) > 0,
      });
      previous = uncached;
    }
    // Each change must alter the pixels, or a cache that ignored it would still pass.
    expect(painted).toEqual(
      sequence.map((step) => ({ step: step.label, differing: 0, changed: !step.repeat }))
    );
  },
  PAINT_TIMEOUT_MS
);

it('records a fill once for repeated paints and parses each page’s regions once', async () => {
  const painter = await freshPainter();
  const parse = vi.spyOn(skia.Path, 'MakeFromSVGString');
  const record = vi.spyOn(skia, 'PictureRecorder');
  const turtle = context({ pageId: 'turtle' });
  const canvas = skia.Surface.Make(64, 64).getCanvas();
  for (let paint = 0; paint < 5; paint++) painter.paintStroke(canvas, scribble(PORTRAIT), turtle);
  expect(record).toHaveBeenCalledTimes(1);
  for (const changed of [
    context({ pageId: 'turtle', theme: 'dark' }),
    context({ pageId: 'turtle', theme: 'dark', projection: WIDER }),
    context({ pageId: 'turtle', projection: ROTATED }),
  ])
    painter.paintStroke(canvas, scribble(changed.projection), changed);
  expect(record).toHaveBeenCalledTimes(4);
  expect(parse).toHaveBeenCalledTimes(COLORING_FILLS.turtle.regions.length);
  painter.paintStroke(canvas, scribble(PORTRAIT), context({ pageId: 'flower' }));
  expect(parse).toHaveBeenCalledTimes(
    COLORING_FILLS.turtle.regions.length + COLORING_FILLS.flower.regions.length
  );
});
