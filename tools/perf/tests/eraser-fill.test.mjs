import { describe, expect, it } from 'vitest';
import { ERASER_FILL_COLOR, eraserFillFunctionSource } from '../lib/eraser-fill.mjs';

// The fill runs inside a capture page, so the source is executed here against a
// stubbed DOM — the same standard bootstrap-theme.test.mjs set: prove it runs,
// not that it was written. The fakes honor coordinates: a fill that painted one
// pixel must fail the corner sampling, which a coordinate-blind fake cannot see.
function fakeTile({
  backing = '100x80',
  width = 100,
  height = 80,
  paintTakes = true,
  coverOnly = null,
} = {}) {
  const context = {
    fillStyle: null,
    fillRects: [],
    globalAlpha: 0.5,
    globalCompositeOperation: 'destination-out',
    save() {},
    restore() {},
    setTransform() {},
    fillRect(...args) {
      this.fillRects.push(args);
    },
  };
  const canvas = {
    dataset: { tileBacking: backing },
    width,
    height,
    getContext: () => context,
    context,
  };
  canvas.alphaAt = (x, y) => {
    if (!paintTakes) return 0;
    const covered = context.fillRects.some(
      ([rx, ry, rw, rh]) =>
        x >= rx && y >= ry && x < rx + (coverOnly?.w ?? rw) && y < ry + (coverOnly?.h ?? rh)
    );
    return covered ? 255 : 0;
  };
  return canvas;
}

// The verification reads through a 1x1 willReadFrequently scratch (the
// emptyScan.ts pattern) so the live tiles' accelerated contexts are never read
// back directly; the fake scratch resolves alpha from the SOURCE canvas at the
// sampled coordinates.
function fakeScratch() {
  let sampled = null;
  return {
    width: 0,
    height: 0,
    getContext: (kind, options) => {
      if (options?.willReadFrequently !== true) {
        throw new Error('the scratch must be created with willReadFrequently');
      }
      return {
        clearRect() {
          sampled = null;
        },
        drawImage(source, x, y) {
          sampled = source.alphaAt ? source.alphaAt(x, y) : 0;
        },
        getImageData() {
          return { data: [124, 77, 255, sampled ?? 0] };
        },
      };
    },
  };
}

function runFill(tiles) {
  const script = new Function('document', `${eraserFillFunctionSource()}\nreturn fillEraserInk();`);
  return script({
    querySelectorAll: () => tiles,
    createElement: (tag) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      return fakeScratch();
    },
  });
}

describe('the verified eraser fill', () => {
  it('refuses a page with no live tiles at all', () => {
    expect(() => runFill([])).toThrow('no live tiles to fill for the eraser');
  });

  // The engine defers hidden-backing realization on a blank canvas; a fill
  // painted into a lagging backing is wiped when the first stroke resizes it,
  // so the fill must wait rather than paint pixels the stroke will destroy.
  it('reports a backing still lagging its intended size instead of filling it', () => {
    const lagging = fakeTile({ backing: '100x80', width: 300, height: 150 });

    const result = runFill([fakeTile(), lagging]);

    expect(result.pending).toEqual(['100x80 vs 300x150']);
    expect(lagging.context.fillRects).toHaveLength(0);
  });

  // A tile publishing no intent cannot be verified against anything — filling
  // whatever backing it happens to hold is the vacuous pass this module exists
  // to prevent, so it is pending, not skipped.
  it('treats a tile with no published intent as pending rather than fillable', () => {
    const silent = fakeTile({ backing: '', width: 300, height: 150 });

    const result = runFill([fakeTile(), silent]);

    expect(result.pending).toEqual(['no published intent vs 300x150']);
    expect(silent.context.fillRects).toHaveLength(0);
  });

  it('fills every realized backing edge to edge, resetting inherited context state', () => {
    const tiles = [fakeTile(), fakeTile({ backing: '90x70', width: 90, height: 70 })];

    const result = runFill(tiles);

    expect(result).toEqual({ tiles: 2, backings: ['100x80', '90x70'], transparentTiles: [] });
    expect(tiles[0].context.fillStyle).toBe(ERASER_FILL_COLOR);
    expect(tiles[0].context.fillRects).toEqual([[0, 0, 100, 80]]);
    // A context inheriting destination-out or a lowered alpha would silently
    // paint nothing; the fill must reset both before painting.
    expect(tiles[0].context.globalCompositeOperation).toBe('source-over');
    expect(tiles[0].context.globalAlpha).toBe(1);
  });

  it('names a tile whose paint did not become opaque', () => {
    const result = runFill([fakeTile(), fakeTile({ paintTakes: false })]);

    expect(result.transparentTiles).toEqual([1]);
  });

  // The corner sampling is what makes partial paint detectable: a fill that
  // covered only the origin pixel passes a coordinate-blind check and must
  // fail this one.
  it('fails a fill that covered only part of the backing', () => {
    const partial = fakeTile({ coverOnly: { w: 1, h: 1 } });

    const result = runFill([fakeTile(), partial]);

    expect(result.transparentTiles).toEqual([1]);
  });
});
