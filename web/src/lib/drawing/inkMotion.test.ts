import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLEAR_SHEET_DURATION_MS, createInkMotion } from './inkMotion';
import type { EngineViewState } from './paperView';
import type { DotOp, StrokeGroupCommand } from './strokeOps';

// The path stays a parameter because Vite rewrites a literal
// `new URL('./literal', import.meta.url)` into the served asset's http URL,
// which readFileSync rejects (precedent: app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('undo ghost start', () => {
  it('pauses the ghost in app.css and runs it from the class inkMotion.ts adds', () => {
    const css = sourceFile('../../app.css');
    const runningClass = sourceFile('./inkMotion.ts').match(/classList\.add\('([\w-]+)'\)/)?.[1];
    expect(runningClass, 'inkMotion.ts adds a class to start the ghost').toBeDefined();

    expect(css).toMatch(/\.undo-ink-motion\s*\{[^}]*animation:[^;]*\bpaused\b/);
    expect(css).toMatch(
      new RegExp(`\\.undo-ink-motion\\.${runningClass}\\s*\\{[^}]*animation-play-state:\\s*running`)
    );
  });
});

describe('clear sheet timing', () => {
  it("matches app.css's clear-sheet animation, which the clear gesture waits out", () => {
    const match = sourceFile('../../app.css').match(/animation:\s*clear-sheet\s+(\d+)ms/);
    expect(match, 'app.css declares a clear-sheet animation duration').not.toBeNull();

    expect(CLEAR_SHEET_DURATION_MS).toBe(Number(match![1]));
  });
});

// Every 2D call the ghost makes, in order, tagged with the canvas it landed on
// and the composite mode in force, so a test can assert what the ghost settles
// and when.
type CanvasCall = { canvas: HTMLCanvasElement; name: string; composite: string };

function recordingContext(canvas: HTMLCanvasElement, calls: CanvasCall[]) {
  const state: Record<string | symbol, unknown> = { globalCompositeOperation: 'source-over' };
  return new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      return () => {
        calls.push({
          canvas,
          name: String(name),
          composite: String(target.globalCompositeOperation),
        });
      };
    },
    set(target, name, value) {
      target[name] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function recordCanvasCalls() {
  const calls: CanvasCall[] = [];
  const original = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement & { _recorded?: CanvasRenderingContext2D }
  ) {
    this._recorded ??= recordingContext(this, calls);
    return this._recorded;
  };
  return { calls, restore: () => (HTMLCanvasElement.prototype.getContext = original) };
}

const view: EngineViewState = {
  active: false,
  scale: 1,
  rotate: 0,
  tx: 0,
  ty: 0,
  paperCssWidth: 200,
  paperCssHeight: 200,
  paperOrientation: 'portrait',
};
const penDot: DotOp = { kind: 'dot', x: 60, y: 60, radius: 10, color: '#ff0000', erase: false };

describe('undo ghost tile reads', () => {
  let recorder: ReturnType<typeof recordCanvasCalls>;
  let canvas: HTMLCanvasElement;
  const tile = document.createElement('canvas');

  beforeEach(() => {
    recorder = recordCanvasCalls();
    const host = document.createElement('div');
    canvas = document.createElement('canvas');
    host.append(canvas);
  });
  afterEach(() => recorder.restore());

  const undoGhost = (command: StrokeGroupCommand) =>
    createInkMotion((target) => target.drawImage(tile, 0, 0)).undo(canvas, command, view, 1, null);
  const readBacks = () => recorder.calls.filter((call) => call.name === 'getImageData');

  it('settles a tile-read ghost after its mask and before the undo restore runs', () => {
    undoGhost({ wasEmpty: false, ops: [{ ...penDot, crayon: true }] });

    const masked = recorder.calls.findIndex(
      (call) => call.name === 'drawImage' && call.composite === 'destination-in'
    );
    const settled = recorder.calls.findIndex((call) => call.name === 'getImageData');
    expect(masked).toBeGreaterThanOrEqual(0);
    expect(settled).toBeGreaterThan(masked);
    expect(recorder.calls[settled].canvas).toBe(recorder.calls[masked].canvas);
  });

  it('leaves a replayed pen ghost unread, since it never reads the tiles', () => {
    undoGhost({ wasEmpty: false, ops: [penDot] });

    expect(recorder.calls.some((call) => call.name === 'drawImage')).toBe(false);
    expect(readBacks()).toHaveLength(0);
  });
});
