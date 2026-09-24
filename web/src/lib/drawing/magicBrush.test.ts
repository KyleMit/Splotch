import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT } from './magicSheetGradient';

// A deterministic pseudo-random sequence so gradient generation is reproducible
// in the test (the module defaults to Math.random in the app).
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('rainbow gradient generation', () => {
  it('produces a distinct rainbow for each of MAGIC_GRADIENT_COUNT seeds', () => {
    const gradients = Array.from({ length: MAGIC_GRADIENT_COUNT }, (_, i) =>
      createRainbowGradient(seededRand(i + 1))
    );
    const serialized = new Set(gradients.map((g) => JSON.stringify(g)));
    expect(serialized.size).toBe(MAGIC_GRADIENT_COUNT);
  });

  it('produces a rainbow of ascending hsl stops from 0 to 1', () => {
    const g = createRainbowGradient(seededRand(1));
    expect(g.stops.length).toBeGreaterThanOrEqual(2);
    expect(g.stops[0].offset).toBe(0);
    expect(g.stops[g.stops.length - 1].offset).toBe(1);
    for (let i = 1; i < g.stops.length; i++) {
      expect(g.stops[i].offset).toBeGreaterThan(g.stops[i - 1].offset);
    }
    for (const s of g.stops) {
      const m = /^hsl\((\d+(?:\.\d+)?), \d/.exec(s.color);
      expect(m).not.toBeNull();
      const hue = Number(m![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('varies between seeds so the pool is a set of distinct rainbows', () => {
    const a = createRainbowGradient(seededRand(1));
    const b = createRainbowGradient(seededRand(99));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('magic sheet fill-load failure', () => {
  // happy-dom neither loads images nor has a real 2D context, so the fill decode is
  // driven by hand through a stubbed Image and the sheet rasterizes into a fake
  // context. The module is re-imported after vi.resetModules() so each case gets
  // its own fill/gradient/sheet state instead of inheriting the previous one's.
  const REAL_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;
  const PAGE_URL = '/coloring/first.light.webp';
  const OTHER_PAGE_URL = '/coloring/second.light.webp';

  const requested: FakeImage[] = [];

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    src = '';
    constructor() {
      requested.push(this);
    }
  }

  beforeEach(() => {
    vi.resetModules();
    requested.length = 0;
    vi.stubGlobal('Image', FakeImage);
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({
        clearRect() {},
        drawImage() {},
        fillRect() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        fillStyle: '',
      }) as unknown as CanvasRenderingContext2D;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    HTMLCanvasElement.prototype.getContext = REAL_GET_CONTEXT;
  });

  const PAPER = { width: 400, height: 300 };

  async function mountedMagicBrush() {
    const magic = await import('./magicBrush');
    magic.initMagicBrush({
      paperSize: () => PAPER,
      sheetBounds: () => ({ x: 0, y: 0, ...PAPER }),
      hasRetainedOps: () => false,
      magicActive: () => false,
      repaint: () => {},
    });
    return magic;
  }

  function lastRequest(): FakeImage {
    return requested[requested.length - 1];
  }

  it('recovers from a failed fill with no further user action', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    expect(magic.captureMagicSheet()).toBeNull();

    lastRequest().onerror!();

    // A page session holds no gradient, so the error handler has to take one over
    // itself without the child toggling brushes or clearing the canvas.
    expect(magic.captureMagicSheet()).not.toBeNull();
  });

  it('recovers with a rainbow that was already held before the page', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    magic.setColorSheet(PAGE_URL);

    lastRequest().onerror!();

    // The held rainbow is kept, but the sheet still carries the (never-drawn) fill
    // source, so recovery has to re-rasterize rather than assume a gradient handoff.
    expect(magic.captureMagicSheet()).not.toBeNull();
  });

  it('keeps a captured sheet immutable when the active source changes', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    const first = magic.captureMagicSheet();
    magic.clearMagicGradient();
    magic.ensureMagicSheet();
    const second = magic.captureMagicSheet();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.canvas).not.toBe(first!.canvas);

    const sources: CanvasImageSource[] = [];
    const target = {
      createPattern: (source: CanvasImageSource) => {
        sources.push(source);
        return { setTransform() {} };
      },
    } as unknown as CanvasRenderingContext2D;
    expect(magic.sheetPatternFor(target, first)).not.toBeNull();
    expect(sources).toEqual([first!.canvas]);
  });

  it('defers a resized inactive sheet until the brush is selected again', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    const beforeResize = magic.captureMagicSheet();
    magic.resizeMagicSheet(false);

    expect(magic.captureMagicSheet()).toBe(beforeResize);

    magic.ensureMagicSheet();
    expect(magic.captureMagicSheet()).not.toBe(beforeResize);
  });

  it('re-attempts the load when the same page is applied again', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(1);

    lastRequest().onerror!();

    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(2);
    expect(lastRequest().src).toBe(PAGE_URL);
  });

  it('defers an incoming fill without exposing the outgoing page to new strokes', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    lastRequest().naturalWidth = 200;
    lastRequest().naturalHeight = 100;
    lastRequest().onload!();
    const outgoing = magic.captureMagicSheet();

    magic.deferColorSheet(OTHER_PAGE_URL);
    magic.ensureMagicSheet();

    expect(outgoing).not.toBeNull();
    expect(magic.captureMagicSheet()).toBeNull();
    expect(requested).toHaveLength(1);

    magic.setColorSheet(OTHER_PAGE_URL);
    expect(requested).toHaveLength(2);
    expect(lastRequest().src).toBe(OTHER_PAGE_URL);
  });

  it('starts a deferred fill when the overlay decode never settles', async () => {
    vi.useFakeTimers();
    const magic = await mountedMagicBrush();

    magic.deferColorSheet(PAGE_URL);
    expect(requested).toHaveLength(0);

    await vi.runOnlyPendingTimersAsync();

    expect(requested).toHaveLength(1);
    expect(lastRequest().src).toBe(PAGE_URL);
  });

  it('detaches a cleared fill before the overlay effect settles', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    lastRequest().naturalWidth = 200;
    lastRequest().naturalHeight = 100;
    lastRequest().onload!();
    expect(magic.captureMagicSheet()).not.toBeNull();

    magic.deferColorSheet(null);

    expect(magic.captureMagicSheet()).toBeNull();
    expect(requested).toHaveLength(1);

    magic.setColorSheet(null);
    expect(magic.captureMagicSheet()).toBeNull();
  });

  it('ignores a superseded error so it cannot clobber a newer page', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    const superseded = lastRequest();

    magic.setColorSheet(OTHER_PAGE_URL);
    const current = lastRequest();
    current.naturalWidth = 200;
    current.naturalHeight = 100;
    current.onload!();
    expect(magic.captureMagicSheet()).not.toBeNull();

    superseded.onerror!();

    expect(magic.captureMagicSheet()).not.toBeNull();
    // The newer page is still attached, so re-applying it stays a no-op.
    magic.setColorSheet(OTHER_PAGE_URL);
    expect(requested).toHaveLength(2);
  });

  // A theme switch cycles the sheet through the night fill and back
  // (DrawingCanvas's resolvedTheme effect), so the current page's URL can equal an
  // abandoned load's — only load identity separates them.
  it('ignores a superseded error from an earlier load of the page now current again', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    const abandoned = lastRequest();
    magic.setColorSheet(OTHER_PAGE_URL);
    magic.setColorSheet(PAGE_URL);
    const current = lastRequest();

    abandoned.onerror!();

    current.naturalWidth = 200;
    current.naturalHeight = 100;
    current.onload!();
    expect(magic.captureMagicSheet()).not.toBeNull();

    // The page is still attached — had the stale error detached it, this would
    // start a fourth load instead of no-oping (and the captured sheet above would
    // have come from a fallback rainbow rather than the page's own fill).
    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(3);
  });
});
