import { afterEach, describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  clearTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  commitTiledCommand,
  recordTiledOp,
  repaintTiledRenderer,
  renderTiledOp,
  resizeTiledRenderer,
  undoTiledCommand,
} from './tiledRenderer';
import { installTiledRendererTestHarness, rendererElements } from './tiledRendererTestHarness';
import { configureCrayonDeposition } from './crayonPassBuffer';

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  crayonPatternFor: () => ({}) as CanvasPattern,
}));

installTiledRendererTestHarness();

// ADR-0147's hot-path constraint, pinned end to end: a nonblank undo restore
// or a repaint stales the under shadow, the deferred drain — never the next
// pass — performs the composited-tile read.
// Records the SOURCE of every drawImage on every context, so a read FROM the
// live tile is visible wherever it lands — the shadow capture blits the tile
// into an offscreen canvas, so counting calls on the tile's own context would
// miss it entirely.
function trackDrawImageSources() {
  const sources: unknown[] = [];
  const original = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    ...args: unknown[]
  ) {
    const context = (original as unknown as (...a: unknown[]) => unknown).apply(this, args) as
      | (CanvasRenderingContext2D & { __readTracked?: boolean })
      | null;
    if (context && !context.__readTracked) {
      context.__readTracked = true;
      const draw = context.drawImage.bind(context);
      context.drawImage = ((...drawArgs: unknown[]) => {
        sources.push(drawArgs[0]);
        return (draw as (...a: unknown[]) => unknown)(...drawArgs);
      }) as typeof context.drawImage;
    }
    return context;
  };
  return sources;
}

describe('crayon under-shadow refresh scheduling', () => {
  afterEach(() => {
    // configureCrayonDeposition installs a module-level stroke probe; restore
    // the default so one test's probe cannot leak into the next.
    configureCrayonDeposition('restamp');
    vi.unstubAllGlobals();
  });

  it('Clear during the deferred stamp window cannot mutate the tile after its snapshot', () => {
    // clearTiledRenderer hides the tiles and schedules its undo capture one
    // frame at a time; resetCrayonStateForClear only runs later, when that
    // backing is mutated. A stamp still pending from a closed pass therefore
    // landed AFTER the Clear snapshot, splitting the undo image across pre-
    // and post-glaze pixels.
    configureCrayonDeposition('deferred');
    const writes = trackDrawImageSources();
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const drain = () => {
      for (let i = 0; i < 8 && frames.length; i++) frames.shift()!(0);
    };
    const crayonDot = (seed: number): StrokeOp => ({
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
      crayon: true,
      seed,
    });
    const stroke = (seed: number, wasEmpty: boolean) => {
      beginTiledCommand(wasEmpty);
      renderTiledOp(crayonDot(seed));
      recordTiledOp(crayonDot(seed));
      const close: StrokeOp = { kind: 'crayonFlush', final: true };
      renderTiledOp(close);
      recordTiledOp(close);
      commitTiledCommand();
    };

    stroke(1, true);
    drain();
    // A second stroke over that ink closes NON-virgin, arming a deferred stamp.
    stroke(2, false);

    const tile = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')].find(
      (candidate) => !candidate.hidden
    )!;
    // A glaze stamp blits FROM an offscreen buffer; Clear's own progressive
    // undo capture reads FROM the tile. Counting only the former isolates the
    // mutation this test is about from the capture that legitimately runs in
    // the same frames.
    const stamps = () => writes.filter((source) => source !== tile).length;

    // Clear lands inside the two-frame window.
    clearTiledRenderer(false);
    const atClear = stamps();
    drain();

    // The outstanding glaze is settled synchronously inside clearTiledRenderer,
    // before its capture, so no stamp lands afterwards.
    expect(stamps()).toBe(atClear);

    configureCrayonDeposition('restamp');
  });

  it('a drain that lands mid-stroke re-arms instead of dropping', () => {
    // A mid-stroke checkpoint flush schedules a drain; the closing flush rides
    // that same schedule. If the drain fires while the finger is still down
    // and simply yields, nothing re-arms it — and the next pass opens on the
    // synchronous whole-tile read this machinery exists to remove. Regression
    // for the 0.85% -> 1.35% main regression measured 2026-08-27.
    const readSources = trackDrawImageSources();
    const { canvas } = rendererElements();
    let strokeActive = true;
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => strokeActive,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    configureCrayonDeposition('restamp', () => strokeActive);

    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const drainFrames = () => {
      for (let i = 0; i < 6 && frames.length; i++) frames.shift()!(0);
    };
    const crayonDot = (seed: number): StrokeOp => ({
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
      crayon: true,
      seed,
    });

    // Ink the tile, then close a pass while the finger is still down — the
    // drain fires mid-stroke and must yield.
    beginTiledCommand(true);
    renderTiledOp(crayonDot(1));
    recordTiledOp(crayonDot(1));
    renderTiledOp({ kind: 'crayonFlush' });
    recordTiledOp({ kind: 'crayonFlush' });
    commitTiledCommand();
    drainFrames();

    const tile = canvas.parentElement!.querySelector<HTMLCanvasElement>(
      '[data-live-tile]:not([hidden])'
    )!;
    const tileReads = () => readSources.filter((source) => source === tile).length;
    // Mid-stroke the drain must yield: no shadow read while the finger is down.
    const duringStroke = tileReads();

    // Finger up. The drain the mid-stroke firing consumed must have re-armed,
    // so the shadow refreshes HERE, between strokes — exactly one tile read.
    // Without the re-arm nothing is scheduled and this count stays flat, which
    // pushes the read into the next pass's contact window.
    strokeActive = false;
    drainFrames();
    expect(tileReads() - duringStroke).toBe(1);

    undoTiledCommand(1);
  });

  it('undo and repaint keep the next crayon pass off the synchronous tile read', () => {
    // Wrap the harness contexts so every drawImage records its SOURCE — a
    // read FROM the live tile is exactly the GPU sync ADR-0147 rations.
    const readSources: unknown[] = [];
    const stubbedGetContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      const context = (stubbedGetContext as unknown as (...a: unknown[]) => unknown).apply(
        this,
        args
      ) as (CanvasRenderingContext2D & { __readTracked?: boolean }) | null;
      if (context && !context.__readTracked) {
        context.__readTracked = true;
        const original = context.drawImage.bind(context);
        context.drawImage = ((...drawArgs: unknown[]) => {
          readSources.push(drawArgs[0]);
          return (original as (...a: unknown[]) => unknown)(...drawArgs);
        }) as typeof context.drawImage;
      }
      return context;
    };

    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const drainFrames = () => {
      while (frames.length) frames.shift()!(0);
    };
    const crayonDot = (seed: number): StrokeOp => ({
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
      crayon: true,
      seed,
    });
    const commitCrayon = (wasEmpty: boolean, seed: number) => {
      beginTiledCommand(wasEmpty);
      const dot = crayonDot(seed);
      renderTiledOp(dot);
      recordTiledOp(dot);
      const crayonFlush: StrokeOp = { kind: 'crayonFlush' };
      renderTiledOp(crayonFlush);
      recordTiledOp(crayonFlush);
      commitTiledCommand();
      drainFrames();
    };

    commitCrayon(true, 1);
    commitCrayon(false, 2);
    const tile = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')].find(
      (candidate) => !candidate.hidden
    )!;
    const tileReads = () => readSources.filter((source) => source === tile).length;

    // The op window: begin a command and render one ink op, counting tile
    // reads before any flush or deferred drain runs. Pen's window contains
    // exactly the undo-patch snapshot every brush pays — crayon's window must
    // contain nothing more, i.e. pass-open performs no synchronous capture.
    const opWindowTileReads = (op: StrokeOp) => {
      beginTiledCommand(false);
      const before = tileReads();
      renderTiledOp(op);
      recordTiledOp(op);
      const reads = tileReads() - before;
      const crayonFlush: StrokeOp = { kind: 'crayonFlush' };
      renderTiledOp(crayonFlush);
      recordTiledOp(crayonFlush);
      commitTiledCommand();
      drainFrames();
      return reads;
    };
    const penDot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#0000ff',
      erase: false,
    };

    // A nonblank undo restore stales the shadow; the deferred drain — not the
    // restore itself, and not the next pass — performs the one tile read.
    readSources.length = 0;
    undoTiledCommand(1);
    const readsAtRestore = tileReads();
    drainFrames();
    expect(tileReads() - readsAtRestore).toBe(1);

    const penReadsAfterUndo = opWindowTileReads(penDot);
    expect(opWindowTileReads(crayonDot(3))).toBe(penReadsAfterUndo);

    // Same contract across a repaint: whatever the replay itself read, the
    // pass AFTER the deferred drain opens reading nothing pen would not.
    repaintTiledRenderer();
    drainFrames();
    const penReadsAfterRepaint = opWindowTileReads(penDot);
    expect(opWindowTileReads(crayonDot(4))).toBe(penReadsAfterRepaint);

    undoTiledCommand(1);
    undoTiledCommand(1);
    drainFrames();
  });
  it('an undone deferred crayon stroke cannot reappear two frames later', () => {
    configureCrayonDeposition('deferred');
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const drain = () => {
      while (frames.length) frames.shift()!(0);
    };
    const crayonStroke = (seed: number, wasEmpty: boolean) => {
      beginTiledCommand(wasEmpty);
      const dot: StrokeOp = {
        kind: 'dot',
        x: 50,
        y: 50,
        radius: 5,
        color: '#ff0000',
        erase: false,
        crayon: true,
        seed,
      };
      renderTiledOp(dot);
      recordTiledOp(dot);
      const close: StrokeOp = { kind: 'crayonFlush', final: true };
      renderTiledOp(close);
      recordTiledOp(close);
      commitTiledCommand();
      drain();
    };

    // First stroke onto blank paper, then a second over that ink — the second
    // is the non-virgin pass that arms a deferred stamp.
    crayonStroke(1, true);
    crayonStroke(2, false);
    const tile = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')].find(
      (candidate) => !candidate.hidden
    )!;

    beginTiledCommand(false);
    const dot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#00ff00',
      erase: false,
      crayon: true,
      seed: 3,
    };
    renderTiledOp(dot);
    recordTiledOp(dot);
    const close: StrokeOp = { kind: 'crayonFlush', final: true };
    renderTiledOp(close);
    recordTiledOp(close);
    commitTiledCommand();

    // Undo lands inside the stamp's two-frame window: the restore must win,
    // and the pending stamp must never repaint the undone wax.
    undoTiledCommand(1);
    const context = vi.mocked(tile.getContext('2d')!);
    const blitsAfterUndo = context.drawImage.mock.calls.length;
    drain();
    expect(context.drawImage.mock.calls.length).toBe(blitsAfterUndo);

    configureCrayonDeposition('restamp');
  });
});
