import { describe, expect, it } from 'vitest';
import { ERASER_FILL_COLOR, eraserFillFunctionSource } from '../lib/eraser-fill.mjs';

// The fill runs inside a capture page, so the source is executed here against a
// stubbed DOM — the same standard bootstrap-theme.test.mjs set: prove it runs,
// not that it was written.
function fakeTile({ backing = '100x80', width = 100, height = 80, alpha = 255 } = {}) {
  const context = {
    fillStyle: null,
    fillRects: [],
    save() {},
    restore() {},
    setTransform() {},
    fillRect(...args) {
      this.fillRects.push(args);
    },
    getImageData() {
      return { data: [124, 77, 255, alpha] };
    },
  };
  return {
    dataset: { tileBacking: backing },
    width,
    height,
    getContext: () => context,
    context,
  };
}

function runFill(tiles) {
  const script = new Function('document', `${eraserFillFunctionSource()}\nreturn fillEraserInk();`);
  return script({ querySelectorAll: () => tiles });
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

  it('fills every realized backing edge to edge and proves the pixels are opaque', () => {
    const tiles = [fakeTile(), fakeTile({ backing: '90x70', width: 90, height: 70 })];

    const result = runFill(tiles);

    expect(result).toEqual({ tiles: 2, backings: ['100x80', '90x70'], transparentTiles: [] });
    expect(tiles[0].context.fillStyle).toBe(ERASER_FILL_COLOR);
    expect(tiles[0].context.fillRects).toEqual([[0, 0, 100, 80]]);
  });

  it('names a tile whose paint did not become opaque', () => {
    const result = runFill([fakeTile(), fakeTile({ alpha: 0 })]);

    expect(result.transparentTiles).toEqual([1]);
  });

  // A collapsed backing with no published intent cannot be waited for, and a
  // zero-area fill is exactly the silent no-op issue 1302 names — it must fail
  // verification rather than pass as trivially filled.
  it('fails a zero-size backing rather than passing it vacuously', () => {
    const result = runFill([fakeTile({ backing: '', width: 0, height: 0 })]);

    expect(result.transparentTiles).toEqual([0]);
  });
});
