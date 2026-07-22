// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampScale,
  clampTransform,
  createAiPreviewLoader,
  createPinchZoom,
  MAX_SCALE,
  MIN_SCALE,
} from './aiPreview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('revokes a style preview that finishes after its owner is invalidated', async () => {
  const pendingExport = deferred<Blob | null>();
  const commit = vi.fn();
  const loader = createAiPreviewLoader(() => pendingExport.promise, commit);

  const load = loader.load();
  loader.invalidate();
  pendingExport.resolve(new Blob(['drawing']));
  await load;

  expect(commit).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late-preview');
});

describe('clampScale', () => {
  it('holds the scale within [MIN_SCALE, MAX_SCALE]', () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });
});

describe('clampTransform', () => {
  const bounds = { width: 200, height: 100 };

  it('pins an un-zoomed layer to the origin so a stray pan does nothing', () => {
    expect(clampTransform({ scale: 1, x: -40, y: 25 }, bounds)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it('keeps the scaled layer covering the surface — never dragged past an edge', () => {
    // At 2x the layer is 400×200, so x may range [-200, 0] and y [-100, 0].
    expect(clampTransform({ scale: 2, x: 50, y: 30 }, bounds)).toEqual({
      scale: 2,
      x: 0,
      y: 0,
    });
    expect(clampTransform({ scale: 2, x: -500, y: -500 }, bounds)).toEqual({
      scale: 2,
      x: -200,
      y: -100,
    });
    expect(clampTransform({ scale: 2, x: -120, y: -40 }, bounds)).toEqual({
      scale: 2,
      x: -120,
      y: -40,
    });
  });
});

describe('createPinchZoom', () => {
  const bounds = () => ({ width: 200, height: 200 });

  it('starts at identity and ignores a lone finger drag on an un-zoomed layer', () => {
    const zoom = createPinchZoom(bounds);
    zoom.down(1, { x: 100, y: 100 });
    zoom.move(1, { x: 40, y: 40 });

    expect(zoom.transform).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoom.isZoomed).toBe(false);
  });

  it('scales up when two fingers spread apart, anchored at the pinch centroid', () => {
    const zoom = createPinchZoom(bounds);
    zoom.down(1, { x: 80, y: 100 });
    zoom.down(2, { x: 120, y: 100 });
    // Spread ×2 about the centroid (100, 100) → 2× zoom, centroid stays put.
    zoom.move(1, { x: 60, y: 100 });
    zoom.move(2, { x: 140, y: 100 });

    expect(zoom.transform.scale).toBeCloseTo(2);
    expect(zoom.isZoomed).toBe(true);
    // The content point under the centroid maps back to the centroid: s*c + t.
    expect(zoom.transform.scale * 100 + zoom.transform.x).toBeCloseTo(100);
    expect(zoom.transform.scale * 100 + zoom.transform.y).toBeCloseTo(100);
  });

  it('never scales past MAX_SCALE', () => {
    const zoom = createPinchZoom(bounds);
    zoom.down(1, { x: 99, y: 100 });
    zoom.down(2, { x: 101, y: 100 });
    zoom.move(1, { x: 0, y: 100 });
    zoom.move(2, { x: 200, y: 100 });

    expect(zoom.transform.scale).toBe(MAX_SCALE);
  });

  it('pans with one finger once zoomed, then resets to fit', () => {
    const zoom = createPinchZoom(bounds);
    zoom.down(1, { x: 80, y: 100 });
    zoom.down(2, { x: 120, y: 100 });
    zoom.move(1, { x: 60, y: 100 });
    zoom.move(2, { x: 140, y: 100 });
    zoom.up(2);

    // A lone finger now pans; the offset stays clamped inside the surface.
    zoom.move(1, { x: 100, y: 100 });
    expect(zoom.transform.scale).toBeCloseTo(2);
    expect(zoom.transform.x).toBeLessThanOrEqual(0);
    expect(zoom.transform.x).toBeGreaterThanOrEqual(-200);

    zoom.reset();
    expect(zoom.transform).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoom.pointerCount).toBe(0);
    expect(zoom.isZoomed).toBe(false);
  });
});
