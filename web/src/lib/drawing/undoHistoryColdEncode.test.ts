import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCanvasStub, freshHistory, paperWideCmd } from './undoHistoryHarness';

// When the cold tier encodes, not what it encodes (undoHistory.test.ts covers
// the tiering itself). Split out because the two need opposite idle stubs: the
// tier suite collapses the wait, this one holds the callback to observe that a
// commit did not pay for the encode.
const canvasStub = createCanvasStub();

beforeEach(() => {
  canvasStub.install();
});

afterEach(() => {
  canvasStub.restore();
  vi.resetModules();
});

describe('cold encode scheduling', () => {
  let idleCallbacks: (() => void)[] = [];

  beforeEach(() => {
    idleCallbacks = [];
    vi.stubGlobal('requestIdleCallback', (fn: () => void) => {
      idleCallbacks.push(fn);
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', () => {});
    // The shared harness fails every encode so snapshots keep their rasters;
    // this suite needs one that succeeds to observe the blob tier at all.
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/png' }));
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defers the encode off the commit that triggered it', async () => {
    const m = await freshHistory();
    m.pushCommand(paperWideCmd('#a', true));
    for (const c of ['#b', '#c', '#d', '#e']) m.pushCommand(paperWideCmd(c));

    // The whole point: on WebKit toBlob blocks inside the call, so a commit
    // that encoded inline would spend its frame budget there. These commits
    // only queued the pass.
    expect(m.getHistoryDebug().blobBytes).toBe(0);

    for (const fn of idleCallbacks.splice(0)) fn();
    expect(m.getHistoryDebug().blobBytes).toBeGreaterThan(0);

    // And the pass coalesces: three more commits queue one callback between
    // them, not one each. (Counted from empty, so the module's unrelated
    // idle users — the pristine-paper warm-up — cannot inflate it.)
    for (const c of ['#f', '#g', '#h']) m.pushCommand(paperWideCmd(c));
    expect(idleCallbacks).toHaveLength(1);
  });
});
