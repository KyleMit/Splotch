import { beforeAll, expect, it, vi } from 'vitest';
import {
  DECODED_IMAGE_LIMIT,
  decodeDataUriImage,
  paintStroke,
} from '../../experiments/native-architecture/src/drawing/skiaInkPainter.ts';
import { LEGACY_PAPER } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

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
