import { describe, expect, it } from 'vitest';
import { canvasDeltaFunctionSource } from '../split-capture/lib/page-bootstrap.mjs';

// The sampler runs inside a capture page, so the source is executed here
// against a stubbed DOM — the bootstrap-theme.test.mjs standard: prove it
// runs, not that it was written. The fake scratch resolves pixel data from
// the SOURCE canvas, so a delta the sampler misses is a delta the test sees.
function fakeSurface(pixels, dataset = { liveTile: '' }) {
  return { pixels, dataset };
}

function fakeScratch() {
  let drawn = null;
  return {
    width: 0,
    height: 0,
    getContext: (kind, options) => {
      if (options?.willReadFrequently !== true) {
        throw new Error('the scratch must be created with willReadFrequently');
      }
      return {
        clearRect() {
          drawn = null;
        },
        drawImage(source) {
          drawn = source.pixels;
        },
        getImageData() {
          return { data: drawn ?? [] };
        },
      };
    },
  };
}

function sample(tiles, { main = null, scratch = fakeScratch } = {}) {
  const script = new Function(
    'document',
    `${canvasDeltaFunctionSource()}\nreturn sampleCanvasDelta();`
  );
  return script({
    querySelectorAll: () => tiles,
    querySelector: (selector) => (selector === '#drawingCanvas' ? main : null),
    createElement: (tag) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement(${tag})`);
      return scratch();
    },
  });
}

describe('sampleCanvasDelta', () => {
  const opaque = [10, 20, 30, 255, 40, 50, 60, 255];

  it('produces identical samples for unchanged pixels and a different digest for any delta', () => {
    const before = sample([fakeSurface([...opaque])]);
    const unchanged = sample([fakeSurface([...opaque])]);
    const painted = sample([fakeSurface([99, 20, 30, 255, 40, 50, 60, 255])]);

    expect(unchanged).toEqual(before);
    expect(painted.digests).not.toEqual(before.digests);
  });

  // The eraser REMOVES ink, so the assertion is "the canvas changed", never
  // "the canvas is non-blank" — a drop in alpha alone must register.
  it('registers the eraser direction: an alpha-only decrease changes the digest', () => {
    const before = sample([fakeSurface([...opaque])]);
    const erased = sample([fakeSurface([10, 20, 30, 0, 40, 50, 60, 255])]);

    expect(erased.digests).not.toEqual(before.digests);
    expect(erased.inkedSamples).toBeLessThan(before.inkedSamples);
  });

  it('samples every surface separately, so one changed tile among many registers', () => {
    const before = sample([fakeSurface([...opaque]), fakeSurface([...opaque])]);
    const after = sample([fakeSurface([...opaque]), fakeSurface([0, 0, 0, 0])]);

    expect(before.surfaces).toBe(2);
    expect(after.digests[0]).toBe(before.digests[0]);
    expect(after.digests[1]).not.toBe(before.digests[1]);
  });

  it('falls back to #drawingCanvas when no live tiles exist', () => {
    const result = sample([], { main: fakeSurface([...opaque], {}) });

    expect(result.surfaces).toBe(1);
    expect(result.digests).toHaveLength(1);
  });

  // A sample that cannot be taken records the failure rather than a verdict;
  // the shared reader then refuses what the probe could not prove.
  it('records an error rather than a verdict when it cannot sample', () => {
    expect(sample([]).error).toContain('no drawing surfaces');
    expect(
      sample([fakeSurface([...opaque])], {
        scratch: () => ({ getContext: () => null }),
      }).error
    ).toContain('no 2d scratch context');
  });
});
