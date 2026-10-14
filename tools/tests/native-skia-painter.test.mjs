import { beforeAll, expect, it, vi } from 'vitest';
import {
  DECODED_IMAGE_LIMIT,
  decodeDataUriImage,
  paintStroke,
} from '../../experiments/native-architecture/src/drawing/skiaInkPainter.ts';
import {
  adoptPaper,
  paperSize,
  LEGACY_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { COLORING_FILLS } from '../../experiments/native-architecture/src/drawing/pages.ts';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';

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

const SIZE = 64;
const context = {
  paper: LEGACY_PAPER,
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
    { ...context, paper, pageId: 'sunshine' }
  );
  const fill = COLORING_FILLS.sunshine;
  const sun = paletteHex(fill.regions[0].colors.light).toLowerCase();
  const sky = paletteHex(fill.background.light).toLowerCase();
  expect(colorAt(surface, Math.floor(width / 2), height / 2)).toBe(sun);
  expect(colorAt(surface, Math.floor(width / 2), 100)).toBe(sky);
  expect(colorAt(surface, Math.floor(width / 2), height - 100)).toBe(sky);
});
