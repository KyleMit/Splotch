import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDeferredRedraw } from '../../experiments/native-architecture/src/drawing/deferredRedraw.ts';

const ROOT = join(fileURLToPath(import.meta.url), '../../..');
const SKIA_INK = 'experiments/native-architecture/src/drawing/SkiaInk.tsx';

function fakeFrames() {
  const frames = new Map();
  let next = 0;
  return {
    clock: {
      requestFrame: (callback) => {
        next += 1;
        frames.set(next, callback);
        return next;
      },
      cancelFrame: (handle) => frames.delete(handle),
    },
    pending: () => frames.size,
    runFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    },
  };
}

describe('deferred ink redraw', () => {
  it('redraws once, two display frames after a request', () => {
    const frames = fakeFrames();
    let redraws = 0;
    const redraw = createDeferredRedraw(frames.clock, () => (redraws += 1));
    redraw.request();
    frames.runFrame();
    expect(redraws).toBe(0);
    frames.runFrame();
    expect(redraws).toBe(1);
    expect(frames.pending()).toBe(0);
  });

  it('restarts the count for a request that arrives while one waits, without queueing another', () => {
    const frames = fakeFrames();
    let redraws = 0;
    const redraw = createDeferredRedraw(frames.clock, () => (redraws += 1));
    redraw.request();
    frames.runFrame();
    redraw.request();
    expect(frames.pending()).toBe(1);
    frames.runFrame();
    expect(redraws).toBe(0);
    frames.runFrame();
    expect(redraws).toBe(1);
    frames.runFrame();
    expect(redraws).toBe(1);
  });

  it('drops a waiting redraw on dispose and accepts a request after it', () => {
    const frames = fakeFrames();
    let redraws = 0;
    const redraw = createDeferredRedraw(frames.clock, () => (redraws += 1));
    redraw.request();
    redraw.dispose();
    expect(frames.pending()).toBe(0);
    redraw.request();
    frames.runFrame();
    frames.runFrame();
    expect(redraws).toBe(1);
  });

  // Android drops the ink view's texture layer when high-contrast text toggles, and the rebuilt
  // layer stays blank until the view presents a frame again (issue 3141). React Native's Skia view
  // cannot mount in Node, so this reads the ink layer for the subscription that redraws it.
  it('redraws the ink view when high-contrast text toggles', () => {
    const source = readFileSync(join(ROOT, SKIA_INK), 'utf8');
    expect(source).toMatch(
      /AccessibilityInfo\.addEventListener\(\s*'highTextContrastChanged',\s*redraw\.request\s*\)/
    );
    expect(source).toMatch(
      /createDeferredRedraw\(FRAME_CLOCK, \(\) => view\.current\?\.redraw\(\)\)/
    );
  });
});
