// The stubbed-canvas harness the undoHistory unit suites share
// (undoHistory.test.ts, undoHistoryDeferred.test.ts).
//
// happy-dom's <canvas> has no 2D context, so this installs a recording stub:
// each canvas's "content" is the ordered list of stroke colors painted onto it,
// drawImage copies a source canvas's content, and clearRect empties it. Giving
// every command a unique color makes a canvas's content the drawing's
// ground-truth in draw order — enough to assert the snapshot stack restores
// exact pre-stroke states and the paper accumulates every fold.
import { vi } from 'vitest';
import type { PathOp, StrokeGroupCommand } from './strokeOps';

import type * as UndoHistoryModule from './undoHistory';

type UndoHistory = typeof UndoHistoryModule;

const PAPER_SIDE = 64;

// Fresh per test — hence a factory over module-scope state: each instance owns
// its own prototype patches and drawImage counter, installed and restored
// around a single case.
export function createCanvasStub() {
  let drawImageCalls = 0;
  let origGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let origToBlob: typeof HTMLCanvasElement.prototype.toBlob;

  return {
    // Every stub drawImage bumps this, so a test can assert a code path copied
    // pixels (patch capture) or didn't (the clear's swap capture).
    get drawImageCalls() {
      return drawImageCalls;
    },

    install() {
      drawImageCalls = 0;
      origGetContext = HTMLCanvasElement.prototype.getContext;
      origToBlob = HTMLCanvasElement.prototype.toBlob;
      // Every encode "fails" by default, so snapshots keep their rasters and
      // stay synchronous; a suite driving the demote/re-inflate/decode
      // transitions installs its own working stub codec over this one.
      HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
        cb(null);
      };
      (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
        this: HTMLCanvasElement,
        kind: string
      ) {
        if (kind !== '2d') return null;
        const canvas = this as HTMLCanvasElement & { _content?: string[]; _ctx?: unknown };
        canvas._content ??= [];
        if (canvas._ctx) return canvas._ctx;
        const ctx = {
          canvas,
          lineCap: '',
          lineJoin: '',
          strokeStyle: '',
          fillStyle: '',
          lineWidth: 0,
          globalCompositeOperation: '',
          save() {},
          restore() {},
          setTransform() {},
          getTransform: () => new DOMMatrix(),
          beginPath() {},
          moveTo() {},
          lineTo() {},
          bezierCurveTo() {},
          quadraticCurveTo() {},
          arc() {},
          createPattern() {
            return {};
          },
          clearRect() {
            canvas._content!.length = 0;
          },
          stroke() {
            canvas._content!.push(String(ctx.strokeStyle));
          },
          fill() {
            canvas._content!.push(String(ctx.fillStyle));
          },
          drawImage(src: { _content?: string[] }) {
            drawImageCalls++;
            if (src?._content) canvas._content!.push(...src._content);
          },
        };
        canvas._ctx = ctx;
        return ctx;
      };
    },

    restore() {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      HTMLCanvasElement.prototype.toBlob = origToBlob;
    },

    // Every canvas in a test shares the stub, so starve exactly one canvas of
    // its context — the grown paper — and restore the stub immediately.
    failNextGetContext() {
      const stub = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function () {
        HTMLCanvasElement.prototype.getContext = stub;
        return null;
      };
    },
  };
}

// A single-stroke command in a unique color.
export function cmd(color: string, magic = false, wasEmpty = false): StrokeGroupCommand {
  const op: PathOp = {
    kind: 'path',
    pid: 1,
    startX: 0,
    startY: 0,
    segs: [{ cx: 0, cy: 0, x: 1, y: 1 }],
    color,
    lineWidth: 8,
    erase: false,
    magic,
  };
  return { ops: [op], wasEmpty };
}

// undoHistory's stacks are module state with no reset export, so isolation
// between cases is a module reset plus a re-import.
export async function freshHistory(): Promise<UndoHistory> {
  vi.resetModules();
  const m = await import('./undoHistory');
  m.ensurePaperCovers(PAPER_SIDE);
  return m;
}

// The color sequence a fresh repaint paints — the visible drawing, ground-truth.
export function repaintedContent(m: UndoHistory): string[] {
  const target = document.createElement('canvas');
  target.width = PAPER_SIDE;
  target.height = PAPER_SIDE;
  const ctx = target.getContext('2d')!;
  m.repaintAll(ctx);
  return [...(target as unknown as { _content: string[] })._content];
}
