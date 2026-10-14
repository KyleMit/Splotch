import { beforeAll, describe, expect, it, vi } from 'vitest';
import { paintHalos } from '../../experiments/native-architecture/src/drawing/skiaHaloPainter.ts';
import {
  HALO_IN_MS,
  HALO_OUT_MS,
  haloPose,
} from '../../experiments/native-architecture/src/drawing/haloModel.ts';

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

// Halos are drawn magnified so a 1px mark spans whole pixels clear of its antialiased edges.
const ZOOM = 4;
const SIZE = 512;
const CENTER = SIZE / 2;
const RGBA_8888 = 4;
const UNPREMULTIPLIED = 3;
const CHANNEL_TOLERANCE = 10;

function paint(kind, size, { now = 0, since = 0, lifting = false, reduced = true } = {}) {
  const surface = skia.Surface.Make(SIZE, SIZE);
  const canvas = surface.getCanvas();
  canvas.scale(ZOOM, ZOOM);
  const at = CENTER / ZOOM;
  const entry = { halo: { id: 1, kind, x: at, y: at, size }, since, lifting };
  paintHalos(canvas, [entry], now, reduced);
  surface.flush();
  const image = surface.makeImageSnapshot();
  return {
    // An offset from the contact in ink-plane pixels.
    at(dx, dy) {
      return [
        ...image.readPixels(CENTER + Math.round(dx * ZOOM), CENTER + Math.round(dy * ZOOM), {
          width: 1,
          height: 1,
          colorType: RGBA_8888,
          alphaType: UNPREMULTIPLIED,
        }),
      ];
    },
  };
}

function expectColor(actual, expected) {
  expected.forEach((channel, index) =>
    expect(Math.abs(actual[index] - channel), `channel ${index} of ${actual}`).toBeLessThanOrEqual(
      CHANNEL_TOLERANCE
    )
  );
}

const alpha = (opacity) => Math.round(opacity * 255);

describe('native Skia Pointer Halos', () => {
  it('rings a stroke just outside its footprint, with a faint glow beyond the line', () => {
    const ring = paint('ring', 20);
    expectColor(ring.at(11, 0), [80, 80, 80, alpha(0.35)]);
    expectColor(ring.at(0, -11), [80, 80, 80, alpha(0.35)]);
    expectColor(ring.at(12.5, 0), [255, 255, 255, alpha(0.35)]);
    expect(ring.at(0, 0)[3]).toBe(0);
    expect(ring.at(8, 0)[3]).toBe(0);
    expect(ring.at(14, 0)[3]).toBe(0);
  });

  it('bands Magic in the rainbow from twelve o’clock, turning clockwise', () => {
    const band = paint('magic', 20);
    expectColor(band.at(0.1, -11.5), [255, 94, 94, 255]);
    expectColor(band.at(11.5, 0), [255, 197, 90, 255]);
    expectColor(band.at(-11.5, 0), [127, 161, 250, 255]);
    expect(band.at(8, 0)[3]).toBe(0);
    expect(band.at(14, 0)[3]).toBe(0);
  });

  it('fills the eraser bubble to the eraser’s own size', () => {
    const bubble = paint('eraser', 20);
    expectColor(bubble.at(0, 0), [255, 255, 255, alpha(0.35)]);
    expectColor(bubble.at(9.5, 0), [80, 80, 80, alpha(0.7)]);
    expectColor(bubble.at(10.5, 0), [255, 255, 255, alpha(0.6)]);
    expect(bubble.at(12, 0)[3]).toBe(0);
  });

  it('grows in from nothing and lifts off to nothing on the shared clock', () => {
    expect(paint('ring', 60, { now: 0, reduced: false }).at(31, 0)[3]).toBe(0);
    const middle = HALO_IN_MS / 2;
    const { scale, opacity } = haloPose(
      { halo: { size: 60 }, since: 0, lifting: false },
      middle,
      false
    );
    const growing = paint('ring', 60, { now: middle, reduced: false });
    expectColor(growing.at(31 * scale, 0), [80, 80, 80, alpha(0.35 * opacity)]);
    expect(growing.at(33 * scale + 1, 0)[3]).toBe(0);
    const lifted = { since: 0, lifting: true, reduced: false };
    expect(paint('ring', 60, { ...lifted, now: HALO_OUT_MS }).at(31, 0)[3]).toBe(0);
    expect(paint('ring', 60, { ...lifted, now: 0 }).at(31, 0)[3]).toBeGreaterThan(0);
  });
});
