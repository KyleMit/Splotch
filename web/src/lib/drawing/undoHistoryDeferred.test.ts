import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StrokeGroupCommand } from './strokeOps';
import { cmd, createCanvasStub, freshHistory } from './undoHistoryHarness';

// Commands deferred behind an in-flight restore never involve the magic sheet,
// so a permanently ready stub keeps the fold path open without pulling in the
// real sheet loader. The unready-sheet behavior lives in undoHistory.test.ts.
vi.mock('./magicBrush', () => ({
  isMagicSheetUnready: () => false,
  captureMagicSheet: () => ({}),
  sheetPatternFor: () => '#magic',
}));

const canvasStub = createCanvasStub();

beforeEach(() => {
  canvasStub.install();
});

afterEach(() => {
  canvasStub.restore();
  vi.resetModules();
});

describe('rebaseDeferredCommands', () => {
  // A restore landing beneath deferred commits rebases the earliest one's
  // captured pre-stroke state and reports whether the canvas is empty once the
  // deferred set replays on the restored paper — the flag engine.ts sets after
  // an undo. The scan runs newest-first: ink anywhere means not empty, an
  // all-'clear' command means empty, an ops-less command is transparent.
  const clearOnly = (): StrokeGroupCommand => ({ ops: [{ kind: 'clear' }], wasEmpty: false });

  function deferInk(m: Awaited<ReturnType<typeof freshHistory>>, color: string) {
    m.beginCommand(false);
    m.recordOp(cmd(color).ops[0]);
    m.commitActiveCommand(true);
  }

  it('passes the restored flag through when nothing is deferred', async () => {
    const m = await freshHistory();
    expect(m.rebaseDeferredCommands(true)).toBe(true);
    expect(m.rebaseDeferredCommands(false)).toBe(false);
  });

  it('reports not-empty while a deferred command holds ink', async () => {
    const m = await freshHistory();
    deferInk(m, '#ink');
    expect(m.rebaseDeferredCommands(true)).toBe(false);
    expect(m.rebaseDeferredCommands(false)).toBe(false);
  });

  it('reports empty when a clear is deferred on top of the deferred ink', async () => {
    const m = await freshHistory();
    deferInk(m, '#ink');
    m.deferCommand(clearOnly());
    expect(m.rebaseDeferredCommands(false)).toBe(true);
  });

  it('sees past an ops-less deferred command to the ink under it', async () => {
    const m = await freshHistory();
    deferInk(m, '#ink');
    // resetActiveCommandForClear leaves the straddling stroke open but empty,
    // so its commit defers a command with no ops at all.
    m.beginCommand(false);
    m.recordOp(cmd('#straddling').ops[0]);
    m.resetActiveCommandForClear();
    m.commitActiveCommand(true);
    expect(m.rebaseDeferredCommands(true)).toBe(false);
  });

  it('falls through to the restored flag when every deferred command is ops-less', async () => {
    const m = await freshHistory();
    m.beginCommand(false);
    m.commitActiveCommand(true);
    expect(m.rebaseDeferredCommands(true)).toBe(true);
    expect(m.rebaseDeferredCommands(false)).toBe(false);
  });

  it('rebases only the earliest deferred command, through to its pushed snapshot', async () => {
    const m = await freshHistory();
    deferInk(m, '#first');
    deferInk(m, '#second');
    m.rebaseDeferredCommands(true);
    m.finalizeDeferredCommand();
    m.finalizeDeferredCommand();
    // LIFO: the later command kept the flag it was begun with; the earliest one
    // carries the restored paper's state into the snapshot its finalize pushed.
    expect((await m.popSnapshot())?.wasEmpty).toBe(false);
    expect((await m.popSnapshot())?.wasEmpty).toBe(true);
  });
});
