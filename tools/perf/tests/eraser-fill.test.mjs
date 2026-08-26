import { describe, expect, it } from 'vitest';
import {
  ERASER_FILL_COLOR,
  eraserFillFunctionSource,
  eraserRefillFunctionSource,
  eraserRefillArming,
} from '../lib/eraser-fill.mjs';
import { GESTURE_REPEATS, eraserRefillShortfall } from '../lib/campaign-plan.mjs';
import { STROKES_PER_GESTURE_REPEAT } from '../ios/capture-xcuitest-screen.mjs';

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

  // verifyOnly is what lets the post-settle check SEE a wipe instead of
  // repainting over it: it must sample without painting a single pixel.
  it('verifies without painting in verify-only mode', () => {
    const unpainted = fakeTile();
    const script = new Function(
      'document',
      `${eraserFillFunctionSource()}\nreturn [fillEraserInk(true), fillEraserInk(), fillEraserInk(true)];`
    );
    const [before, filled, after] = script({
      querySelectorAll: () => [unpainted],
      createElement: () => fakeScratch(),
    });

    expect(before.transparentTiles).toEqual([0]);
    expect(filled.transparentTiles).toEqual([]);
    expect(after.transparentTiles).toEqual([]);
    expect(unpainted.context.fillRects).toHaveLength(1);
  });
});

// Issue 1292: placement schedules cannot keep ten passes fresh (the measured
// optimum still saturates a landscape phone by pass 5), so the page refills
// between passes instead. Executed against a stub window: the counter must see
// only canvas strokes, refill exactly at pass boundaries, skip the final
// stroke, and record an anomalous refill rather than aborting the capture.
describe('the between-pass eraser refill', () => {
  function armed({ everyStrokes, totalStrokes, fill }) {
    const listeners = [];
    const windowStub = {
      addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
    };
    const refills = new Function(
      'window',
      `${eraserRefillFunctionSource()}\nreturn armEraserRefill(${everyStrokes}, ${totalStrokes}, arguments[1]);`
    )(windowStub, fill);
    const onStack = { closest: (selector) => (selector === '.canvas-stack' ? {} : null) };
    const offStack = { closest: () => null };
    return {
      refills,
      windowStub,
      listener: listeners[0],
      stroke: () => listeners[0].handler({ target: onStack }),
      uiTap: () => listeners[0].handler({ target: offStack }),
    };
  }

  it('refills at every pass boundary except the last, counting only canvas strokes', () => {
    const fills = [];
    const { refills, listener, stroke, uiTap, windowStub } = armed({
      everyStrokes: 3,
      totalStrokes: 9,
      fill: () => {
        fills.push('fill');
        return { tiles: 2, transparentTiles: [] };
      },
    });

    expect(listener).toMatchObject({ type: 'pointerup', capture: true });
    expect(windowStub === undefined).toBe(false);
    for (let strokeIndex = 0; strokeIndex < 9; strokeIndex++) {
      uiTap();
      stroke();
    }

    expect(fills).toHaveLength(2);
    expect(refills.map((entry) => entry.afterStroke)).toEqual([3, 6]);
    expect(refills.every((entry) => entry.pending === false)).toBe(true);
  });

  it('records an anomalous refill instead of aborting the capture', () => {
    let calls = 0;
    const { refills, stroke } = armed({
      everyStrokes: 2,
      totalStrokes: 8,
      fill: () => {
        calls += 1;
        if (calls === 1) return { pending: ['100x80 vs 300x150'] };
        if (calls === 2) return { tiles: 2, transparentTiles: [1] };
        throw new Error('tiles vanished');
      },
    });

    for (let strokeIndex = 0; strokeIndex < 7; strokeIndex++) stroke();

    expect(refills).toEqual([
      { afterStroke: 2, pending: true, transparentTiles: [] },
      { afterStroke: 4, pending: false, transparentTiles: [1] },
      { afterStroke: 6, error: 'tiles vanished' },
    ]);
  });
});

// The writer/reader refill-count contract, bound behaviorally through the ONE
// production helper both writers arm with (the PR 1368 review changed a
// writer's totalStrokes expression and the previous constants-only guard
// stayed green — it reconstructed the arithmetic instead of executing it).
// This drives eraserRefillArming -> the recorder -> eraserRefillShortfall as
// one chain, so arithmetic drift in the helper breaks here first, and a
// writer bypassing the helper is one grep away.
describe('the refill-count contract between the writers and the reader', () => {
  it('records exactly repeats - 1 refills under the campaign arming, and the reader agrees', () => {
    const { everyStrokes, totalStrokes } = eraserRefillArming(
      GESTURE_REPEATS,
      STROKES_PER_GESTURE_REPEAT
    );
    const listeners = [];
    const windowStub = {
      addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
    };
    const refills = new Function(
      'window',
      `${eraserRefillFunctionSource()}\nreturn armEraserRefill(${everyStrokes}, ${totalStrokes}, arguments[1]);`
    )(windowStub, () => ({ tiles: 16, transparentTiles: [] }));
    const onStack = { closest: (selector) => (selector === '.canvas-stack' ? {} : null) };
    for (let stroke = 0; stroke < totalStrokes; stroke += 1) {
      listeners[0].handler({ target: onStack });
    }

    expect(refills).toHaveLength(GESTURE_REPEATS - 1);
    expect(eraserRefillShortfall({ eraserRefills: refills }, GESTURE_REPEATS)).toBeNull();
    expect(eraserRefillShortfall({ eraserRefills: refills.slice(1) }, GESTURE_REPEATS)).toEqual({
      recorded: GESTURE_REPEATS - 2,
      expected: GESTURE_REPEATS - 1,
    });
  });
});
