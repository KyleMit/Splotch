import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scale } from '../../web/src/lib/design/tokens.ts';
import {
  EASE_GLIDE,
  HALO_IN_FROM_SCALE,
  HALO_IN_MS,
  HALO_OUT_MS,
  HALO_OUT_TO_SCALE,
  HALO_RAINBOW,
  RAINBOW_BAND_PX,
  RING_LINE_PX,
  haloMotionPending,
  haloPose,
  rainbowArcs,
  reconcileHalos,
} from '../../experiments/native-architecture/src/drawing/haloModel.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { createContactResponder } from '../../experiments/native-architecture/src/drawing/contactResponder.ts';

vi.mock('react-native', () => ({ findNodeHandle: (owner) => owner }));

const root = join(import.meta.dirname, '../..');
const shipping = readFileSync(join(root, 'web/src/lib/components/PointerHalos.svelte'), 'utf8');
const PAPER_TARGET = 7;
const FRAME = { width: 1024, height: 768, pageX: 40, pageY: 800 };

function shippingProjection(source) {
  const read = (pattern) => {
    const match = pattern.exec(source);
    if (!match) throw new Error(`Shipping PointerHalos lost ${pattern}`);
    return match[1];
  };
  return {
    inMs: Number(read(/--halo-in-duration: (\d+)ms/)),
    outMs: Number(read(/--halo-out-duration: (\d+)ms/)),
    inScale: Number(read(/@keyframes halo-in \{\s*from \{[^}]*scale: ([0-9.]+)/)),
    outScale: Number(read(/@keyframes halo-out \{\s*to \{[^}]*scale: ([0-9.]+)/)),
    ringLine: Number(read(/\.brush-ring \{[^}]*border: (\d+)px solid/)),
    band: Number(read(/\.brush-ring\.magic \{[^}]*padding: (\d+)px/)),
    rainbow: read(/conic-gradient\(([^)]*)\)/).split(/,\s*/),
  };
}
const candidate = {
  inMs: HALO_IN_MS,
  outMs: HALO_OUT_MS,
  inScale: HALO_IN_FROM_SCALE,
  outScale: HALO_OUT_TO_SCALE,
  ringLine: RING_LINE_PX,
  band: RAINBOW_BAND_PX,
  rainbow: [...HALO_RAINBOW],
};

function touch(identifier, x, y, timestamp = 100) {
  return {
    identifier,
    locationX: x,
    locationY: y,
    pageX: x + 40,
    pageY: y + 800,
    timestamp,
    target: PAPER_TARGET,
  };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const t of [...touches, ...changedTouches])
    touchBank[t.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === t.identifier),
      startTimeStamp: starts[t.identifier] ?? t.timestamp,
    };
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(0, ...[...touches, ...changedTouches].map((t) => t.timestamp)),
    },
  };
}
function responder(brush) {
  const published = [];
  const input = createContactResponder(
    () => ({
      currentDrawing: () => emptyDrawing(),
      color: 'Blue',
      brush,
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      disabled: false,
      onCohort: () => {},
      onDrawingChange: () => {},
      onError: (error) => {
        throw error;
      },
      sound: null,
    }),
    () => FRAME,
    (_drafts, _paper, halos) => published.push(halos),
    () => 1
  );
  const begin = (value) => {
    input.grant(value);
    input.start(value);
  };
  return { input, begin, halos: () => published.at(-1) };
}

describe('native Pointer Halos', () => {
  it('pins motion, ring and rainbow geometry to the shipping component', () => {
    expect(shippingProjection(shipping)).toEqual(candidate);
    expect(`cubic-bezier(${EASE_GLIDE.join(', ')})`).toBe(scale.easeGlide);
  });
  it('rejects a changed shipping halo duration', () => {
    const changed = shipping.replace('--halo-out-duration: 140ms', '--halo-out-duration: 300ms');
    expect(changed).not.toBe(shipping);
    expect(shippingProjection(changed)).not.toEqual(candidate);
  });

  it('follows one contact with a ring the size of its stroke, then drops it on lift', () => {
    const r = responder('pen');
    r.begin(event([touch(0, 10, 20)]));
    expect(r.halos()).toEqual([{ id: 1, kind: 'ring', x: 10, y: 20, size: 8 }]);
    r.input.move(event([touch(0, 50, 60, 200)], undefined, { 0: 100 }));
    expect(r.halos()).toEqual([{ id: 1, kind: 'ring', x: 50, y: 60, size: 8 }]);
    r.input.release(event([], [touch(0, 55, 65, 300)], { 0: 100 }));
    expect(r.halos()).toEqual([]);
  });
  it('gives each simultaneous contact its own halo', () => {
    const r = responder('pen');
    r.begin(event([touch(0, 10, 20)]));
    r.input.start(
      event([touch(0, 12, 22, 200), touch(1, 80, 90, 200)], [touch(1, 80, 90, 200)], { 0: 100 })
    );
    expect(r.halos().map(({ id, x, y }) => [id, x, y])).toEqual([
      [1, 12, 22],
      [2, 80, 90],
    ]);
  });
  it.each([
    ['magic', 'magic', 8],
    ['eraser', 'eraser', 16],
    ['crayon', 'ring', 8],
  ])('shows the %s brush as a %s halo', (brush, kind, size) => {
    const r = responder(brush);
    r.begin(event([touch(0, 10, 20)]));
    expect(r.halos()).toEqual([{ id: 1, kind, x: 10, y: 20, size }]);
  });

  it('grows a halo in, lifts it off where the contact left, then drops it', () => {
    const halo = { id: 1, kind: 'ring', x: 10, y: 20, size: 8 };
    const grown = reconcileHalos([], [halo], 0, false);
    expect(haloPose(grown[0], 0, false)).toEqual({ scale: HALO_IN_FROM_SCALE, opacity: 0 });
    expect(haloPose(grown[0], HALO_IN_MS, false)).toEqual({ scale: 1, opacity: 1 });
    const moved = reconcileHalos(grown, [{ ...halo, x: 40 }], HALO_IN_MS, false);
    expect(moved[0]).toMatchObject({ since: 0, lifting: false, halo: { x: 40 } });
    const lifting = reconcileHalos(moved, [], 200, false);
    expect(lifting[0]).toMatchObject({ since: 200, lifting: true, halo: { x: 40 } });
    expect(haloPose(lifting[0], 200 + HALO_OUT_MS, false)).toEqual({
      scale: HALO_OUT_TO_SCALE,
      opacity: 0,
    });
    expect(haloMotionPending(lifting, 200 + HALO_OUT_MS - 1, false)).toBe(true);
    expect(reconcileHalos(lifting, [], 200 + HALO_OUT_MS, false)).toEqual([]);
  });
  it('shows and drops halos at once under reduced motion', () => {
    const halo = { id: 1, kind: 'eraser', x: 10, y: 20, size: 16 };
    const shown = reconcileHalos([], [halo], 0, true);
    expect(haloPose(shown[0], 0, true)).toEqual({ scale: 1, opacity: 1 });
    expect(haloMotionPending(shown, 0, true)).toBe(false);
    expect(reconcileHalos(shown, [], 10, true)).toEqual([]);
    const lifting = reconcileHalos(reconcileHalos([], [halo], 0, false), [], 10, false);
    expect(reconcileHalos(lifting, [], 20, true)).toEqual([]);
  });
  it('starts the Magic band at twelve o’clock in the first rainbow color', () => {
    const arcs = rainbowArcs(10);
    expect(arcs[0].d.startsWith('M 0.00 -10.00')).toBe(true);
    expect(arcs[0].color).toBe('rgb(255, 100, 93)');
    expect(arcs.at(-1).color).toBe('rgb(249, 99, 107)');
  });
});
