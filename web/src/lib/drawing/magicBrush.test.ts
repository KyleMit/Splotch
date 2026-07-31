import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT, edgeMargins } from './magicBrush';

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

describe('magic sheet readiness gate', () => {
  // The readiness flags are module-scope singleton state with no reset seam, so the
  // module is re-imported after vi.resetModules() rather than inheriting whatever
  // fill/gradient/sheet state an earlier test left behind.
  beforeEach(() => {
    vi.resetModules();
  });

  it('stays unready whenever the sheet cannot paint, not only while decoding', async () => {
    const { setColorSheet, isMagicSheetUnready } = await import('./magicBrush');

    // Requesting a page starts an async decode; the sheet is not ready to paint.
    setColorSheet('/coloring/test.light.webp');
    expect(isMagicSheetUnready()).toBe(true);

    // Detaching the page settles the decode (fillDecodePending clears), but with no
    // gradient source and no host the sheet re-rasterizes to nothing and stays
    // unready — sheetReady is false while nothing is decoding. This is exactly the
    // state a fillDecodePending-only signal missed: a magic op folded now would
    // render nothing, so the gate must stay closed and the fold defer.
    setColorSheet(null);
    expect(isMagicSheetUnready()).toBe(true);
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
    vi.unstubAllGlobals();
    HTMLCanvasElement.prototype.getContext = REAL_GET_CONTEXT;
  });

  const PAPER = { width: 400, height: 300 };

  async function mountedMagicBrush() {
    const magic = await import('./magicBrush');
    magic.initMagicBrush({
      paperSize: () => PAPER,
      sheetBounds: () => ({ x: 0, y: 0, ...PAPER }),
      repaint: () => {},
    });
    return magic;
  }

  function lastRequest(): FakeImage {
    return requested[requested.length - 1];
  }

  it('reopens the readiness gate with no further user action', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    expect(magic.isMagicSheetUnready()).toBe(true);

    lastRequest().onerror!();

    // A page session holds no gradient, so the error handler has to take one over
    // itself — the gate the pending-decode case above leaves closed forever clears
    // without the child toggling brushes or clearing the canvas.
    expect(magic.isMagicSheetUnready()).toBe(false);
  });

  it('reopens the readiness gate when a rainbow was already held before the page', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    magic.setColorSheet(PAGE_URL);

    lastRequest().onerror!();

    // The held rainbow is kept, but the sheet still carries the (never-drawn) fill
    // source, so recovery has to re-rasterize rather than assume a gradient handoff.
    expect(magic.isMagicSheetUnready()).toBe(false);
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

  it('ignores a superseded error so it cannot clobber a newer page', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    const superseded = lastRequest();

    magic.setColorSheet(OTHER_PAGE_URL);
    const current = lastRequest();
    current.naturalWidth = 200;
    current.naturalHeight = 100;
    current.onload!();
    expect(magic.isMagicSheetUnready()).toBe(false);

    superseded.onerror!();

    expect(magic.isMagicSheetUnready()).toBe(false);
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
    expect(magic.isMagicSheetUnready()).toBe(false);

    // The page is still attached — had the stale error detached it, this would
    // start a fourth load instead of no-oping (and the gate above would have been
    // cleared by a fallback rainbow rather than by the page's own fill).
    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(3);
  });
});

describe('letterbox edge extension geometry', () => {
  // A tall fill contain-fit into a taller viewport → top + bottom margins only.
  it('fills top and bottom margins for a top/bottom letterbox', () => {
    const fills = edgeMargins(400, 1000, 0, 200, 400, 600); // box fills width, 200px bands
    expect(fills).toHaveLength(2);
    const top = fills.find((f) => f.dy === 0)!;
    const bottom = fills.find((f) => f.dy === 800)!;
    // Each destination spans the full picture width and the whole margin height.
    expect(top).toMatchObject({ dx: 0, dy: 0, dw: 400, dh: 200 });
    expect(bottom).toMatchObject({ dx: 0, dy: 800, dw: 400, dh: 200 });
    // Sources are 1px-thin rows sampled just inside the picture, not on the border.
    expect(top.sh).toBe(1);
    expect(top.sy).toBeGreaterThan(0);
    expect(bottom.sh).toBe(1);
    expect(bottom.sy).toBeLessThan(600);
  });

  // A wide fill contain-fit into a wider viewport → left + right margins only.
  it('fills left and right margins for a left/right letterbox, preserving the edge column', () => {
    const fills = edgeMargins(1000, 400, 200, 0, 600, 400);
    expect(fills).toHaveLength(2);
    const left = fills.find((f) => f.dx === 0)!;
    const right = fills.find((f) => f.dx === 800)!;
    expect(left).toMatchObject({ dx: 0, dy: 0, dw: 200, dh: 400 });
    expect(right).toMatchObject({ dx: 800, dy: 0, dw: 200, dh: 400 });
    // 1px-thin columns spanning the full picture height, so the stretched column
    // keeps its along-edge variation (sky at top, grass at bottom).
    expect(left).toMatchObject({ sw: 1, sh: 400 });
    expect(left.sx).toBeGreaterThan(0);
    expect(right).toMatchObject({ sw: 1, sh: 400 });
    expect(right.sx).toBeLessThan(600);
  });

  // A fill whose aspect matches the sheet exactly fills it — no margins to extend.
  it('returns no fills when the picture already fills the sheet', () => {
    expect(edgeMargins(400, 600, 0, 0, 400, 600)).toEqual([]);
  });

  // Under a rotation lock the sheet is larger than the paper on the other axis too,
  // so a centered picture can be inset on all four sides (with corners).
  it('fills all four sides and corners for a doubly-inset picture', () => {
    const fills = edgeMargins(1000, 1000, 200, 300, 600, 400); // 200px L/R, 300px T/B
    expect(fills).toHaveLength(8);
    const top = fills.find((f) => f.dy === 0 && f.dh === 300)!;
    const bottom = fills.find((f) => f.dy === 700)!;
    expect(top).toMatchObject({ dx: 200, dw: 600, sh: 1 });
    expect(bottom).toMatchObject({ dx: 200, dw: 600, dh: 300, sh: 1 });
    const left = fills.find((f) => f.dx === 0 && f.dy === 300)!;
    const right = fills.find((f) => f.dx === 800 && f.dy === 300)!;
    expect(left).toMatchObject({ sy: 0, sh: 400, dw: 200, dh: 400 });
    expect(right).toMatchObject({ sy: 0, sh: 400, dw: 200, dh: 400 });
    const corners = fills.filter((f) => f.dw === 200 && f.dh === 300);
    expect(corners).toHaveLength(4);
    expect(corners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dx: 0, dy: 0 }),
        expect.objectContaining({ dx: 800, dy: 0 }),
        expect.objectContaining({ dx: 0, dy: 700 }),
        expect.objectContaining({ dx: 800, dy: 700 }),
      ])
    );
  });
});
