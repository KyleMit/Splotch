import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cmd, createCanvasStub, freshHistory, repaintedContent } from './undoHistoryHarness';

// Paper sizing and blit coverage (ensurePaperCovers, blitPaperRect), split from
// undoHistory.test.ts, which sits at the max-lines lint cap. These suites never
// fold magic strokes, so the real magicBrush module is fine here.
const canvasStub = createCanvasStub();

beforeEach(() => {
  canvasStub.install();
});

afterEach(() => {
  canvasStub.restore();
});

describe('paper grow', () => {
  it('grows the paper and keeps it for smaller requests', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    const copiesBefore = canvasStub.drawImageCalls;
    m.ensurePaperCovers(128);
    expect(canvasStub.drawImageCalls).toBe(copiesBefore + 1);
    const target = document.createElement('canvas');
    const targetCtx = target.getContext('2d')!;
    m.blitPaperRect(targetCtx, { x: 64, y: 64, w: 1, h: 1 });
    expect(canvasStub.contentOf(target)).toEqual(['#a']);
    const copiesBeforeShrink = canvasStub.drawImageCalls;
    m.ensurePaperCovers(64);
    expect(canvasStub.drawImageCalls).toBe(copiesBeforeShrink);
    // A fresh target, because a wrongly-shrunk paper makes the beyond-64 blit
    // a no-op — against the first target it would false-pass on the leftover
    // '#a' from the pre-request blit.
    const freshTarget = document.createElement('canvas');
    const freshTargetCtx = freshTarget.getContext('2d')!;
    canvasStub.resetRecordedCalls();
    m.blitPaperRect(freshTargetCtx, { x: 64, y: 64, w: 1, h: 1 });
    expect(canvasStub.drawImageArgs).toEqual([[64, 64, 1, 1, 64, 64, 1, 1]]);
    expect(canvasStub.contentOf(freshTarget)).toEqual(['#a']);
    m.pushCommand(cmd('#b'));
    expect(repaintedContent(m)).toEqual(['#a', '#b']);
  });

  it('keeps the old paper when the grown canvas has no context', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#a', false, true));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    canvasStub.failNextGetContext();
    m.ensurePaperCovers(128);
    // Swapping in the blank, context-less canvas would lose '#a' outright and
    // make every later push a silent no-op.
    expect(repaintedContent(m)).toEqual(['#a']);
    m.pushCommand(cmd('#b'));
    expect(repaintedContent(m)).toEqual(['#a', '#b']);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('logs and drops the committed stroke when there is no paper context at all', async () => {
    vi.resetModules();
    canvasStub.failNextGetContext();
    const m = await import('./undoHistory');
    m.ensurePaperCovers(64);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.pushCommand(cmd('#a'));
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});

describe('blitPaperRect', () => {
  it('does not touch a target for a rect wholly outside the paper', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#paper', false, true));
    const target = document.createElement('canvas');
    const targetCtx = target.getContext('2d')!;
    canvasStub.resetRecordedCalls();

    m.blitPaperRect(targetCtx, { x: 64, y: 0, w: 1, h: 1 });

    expect(canvasStub.clearRectArgs).toEqual([]);
    expect(canvasStub.drawImageArgs).toEqual([]);
  });

  it('clips a rect that straddles every paper edge before copying paper content', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#paper', false, true));
    const target = document.createElement('canvas');
    const targetCtx = target.getContext('2d')!;
    canvasStub.resetRecordedCalls();

    m.blitPaperRect(targetCtx, { x: -2, y: -3, w: 70, h: 71 });

    expect(canvasStub.clearRectArgs).toEqual([[0, 0, 64, 64]]);
    expect(canvasStub.drawImageArgs).toEqual([[0, 0, 64, 64, 0, 0, 64, 64]]);
    expect(canvasStub.contentOf(target)).toEqual(['#paper']);
  });

  it('copies with isolated source-over state and restores the target state', async () => {
    const m = await freshHistory();
    m.pushCommand(cmd('#paper', false, true));
    const target = document.createElement('canvas');
    const targetCtx = target.getContext('2d')!;
    targetCtx.globalCompositeOperation = 'multiply';
    targetCtx.globalAlpha = 0.4;
    canvasStub.resetRecordedCalls();

    m.blitPaperRect(targetCtx, { x: 0, y: 0, w: 1, h: 1 });

    expect(canvasStub.drawImageStates).toEqual([
      { globalCompositeOperation: 'source-over', globalAlpha: 1 },
    ]);
    expect(targetCtx.globalCompositeOperation).toBe('multiply');
    expect(targetCtx.globalAlpha).toBe(0.4);
  });
});
