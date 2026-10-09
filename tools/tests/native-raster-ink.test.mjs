// @vitest-environment happy-dom
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RasterInk } from '../../experiments/native-architecture/src/drawing/RasterInk.tsx';
import {
  createSvgCapture,
  PNG_TIMEOUT_MS,
} from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const state = vi.hoisted(() => ({ captures: [], imageLoads: [], frames: new Map(), nextFrame: 0 }));
vi.mock('react-native', () => ({
  View: ({ children, style }) => createElement('div', { style }, children),
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
}));
vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children, width, height, viewBox }, ref) => {
    useImperativeHandle(ref, () => ({
      toDataURL(callback, options) {
        state.captures.push({ callback, options, width, height, viewBox, children });
      },
    }));
    return createElement('div', { 'data-svg-width': width }, children);
  }),
  G: ({ children, opacity }) => createElement('div', { 'data-opacity': opacity }, children),
}));
vi.mock('../../experiments/native-architecture/src/drawing/InkScene.tsx', () => ({
  InkScene: ({ checkpoint, strokes, onImageLoad }) => {
    if (checkpoint) state.imageLoads.push({ checkpoint, onImageLoad });
    return createElement(
      'div',
      { 'data-strokes': strokes.map((stroke) => stroke.brush).join(',') },
      checkpoint &&
        createElement('button', {
          'data-checkpoint': checkpoint.id,
          onClick: onImageLoad,
        })
    );
  },
}));

const crayon = { brush: 'crayon', color: 'Blue', seed: 17, points: [{ x: 40, y: 40 }] };
const magic = { brush: 'magic', rainbow: 3, points: [{ x: 60, y: 60 }] };
const marker = { brush: 'marker', color: 'Yellow', points: [{ x: 80, y: 80 }] };
const erase = { brush: 'eraser', points: [{ x: 960, y: 740 }] };
let root, host, ref, error, busy;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  state.captures.length = 0;
  state.imageLoads.length = 0;
  state.frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++state.nextFrame;
    state.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => state.frames.delete(id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  ref = createRef();
  error = vi.fn();
  busy = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(strokes, prepareEraser = false, draft = null) {
  await act(async () =>
    root.render(
      createElement(RasterInk, {
        ref,
        strokes,
        draft,
        prepareEraser,
        onError: error,
        onBusy: busy,
      })
    )
  );
}
async function frames() {
  for (let count = 0; count < 2; count += 1) {
    await act(async () => {
      const pending = [...state.frames.values()];
      state.frames.clear();
      for (const callback of pending) callback(0);
    });
  }
}
async function png(index, value = 'transparent-png') {
  await act(async () => state.captures[index].callback(value));
}
async function load(width = '100%') {
  const image = [...host.querySelectorAll(`[data-svg-width="${width}"] button`)].at(-1);
  expect(image).not.toBeNull();
  await act(async () => image.click());
}

describe('chronological raster checkpoint lifecycle', () => {
  it('prepares the first selected eraser on the fixed paper grid before admitting input', async () => {
    const prefix = [crayon, magic];
    await render(prefix, true);
    expect(ref.current.isReady()).toBe(false);
    expect(() => ref.current.readyPlan(prefix)).toThrow('still being prepared');
    await frames();
    expect(state.captures).toHaveLength(1);
    expect(state.captures[0]).toMatchObject({
      width: 1024,
      height: 768,
      viewBox: '0 0 1024 768',
      options: { width: 1024, height: 768 },
    });
    expect(state.captures[0].children.props.strokes).toEqual(prefix);
    expect(state.captures[0].children.props.checkpoint).toBeNull();
    await png(0);
    expect(ref.current.isReady()).toBe(false);
    await load();
    expect(ref.current.isReady()).toBe(true);
    await render([...prefix, erase], true);
    expect(ref.current.isReady()).toBe(true);
    expect(state.captures).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('replays loaded erase history through identical boundaries and waits for fixed image load', async () => {
    const strokes = [crayon, magic, erase, marker, erase];
    await render(strokes);
    await frames();
    expect(state.captures[0].children.props.strokes).toEqual(strokes.slice(0, 2));
    await png(0, 'prefix-one');
    await load();
    await frames();
    expect(state.captures).toHaveLength(1);
    await load('1024');
    await frames();
    expect(state.captures).toHaveLength(2);
    expect(state.captures[1].children.props.strokes).toEqual(strokes.slice(2, 4));
    expect(state.captures[1].children.props.checkpoint.strokes).toEqual(strokes.slice(0, 2));
    await png(1, 'prefix-two');
    const incoming = host.querySelector('[data-checkpoint="2"]');
    await act(async () => incoming.click());
    expect(ref.current.isReady()).toBe(true);
    expect(host.querySelectorAll('[data-checkpoint="2"]')).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('refuses an old capture epoch after replacing an equal-length drawing', async () => {
    await render([crayon, magic], true);
    await frames();
    await render([marker, magic], true);
    await frames();
    await png(0, 'stale-prefix');
    expect(host.querySelector('button')).toBeNull();
    expect(state.captures).toHaveLength(2);
    expect(state.captures[1].children.props.strokes[0]).toBe(marker);
    await png(1, 'current-prefix');
    await load();
    expect(ref.current.isReady()).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it('refuses a stale incoming image after replacing the canonical prefix', async () => {
    await render([crayon, magic], true);
    await frames();
    await png(0, 'old-image');
    const oldLoad = state.imageLoads.at(-1).onImageLoad;
    await render([marker, magic], true);
    await act(async () => oldLoad());
    expect(ref.current.isReady()).toBe(false);
    expect(host.querySelector('[data-checkpoint="1"]')).toBeNull();
    expect(state.captures).toHaveLength(1);
    await frames();
    expect(state.captures).toHaveLength(2);
    await png(1, 'replacement-image');
    await load();
    await act(async () => oldLoad());
    expect(ref.current.isReady()).toBe(true);
    expect(ref.current.readyPlan([marker, magic]).checkpoint.base64).toBe('replacement-image');
    await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
    expect(error).not.toHaveBeenCalled();
  });

  it('restarts only the latest of several canonical replacements while older callbacks are held', async () => {
    await render([crayon], true);
    await frames();
    await render([magic], true);
    await frames();
    await render([marker], true);
    await frames();
    expect(state.captures).toHaveLength(3);
    await png(1, 'middle');
    await png(0, 'oldest');
    expect(host.querySelector('button')).toBeNull();
    await png(2, 'latest');
    await load();
    await png(0, 'duplicate-oldest');
    expect(ref.current.readyPlan([marker]).checkpoint.base64).toBe('latest');
    expect(error).not.toHaveBeenCalled();
  });

  it('bounds fixed-grid checkpoint image readiness and refuses late load', async () => {
    await render([crayon, magic, erase, marker, erase]);
    await frames();
    await png(0);
    await load();
    const fixedLoad = state.imageLoads.at(-1).onImageLoad;
    await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0].message).toContain('load for capture');
    await act(async () => fixedLoad());
    await frames();
    expect(state.captures).toHaveLength(1);
    expect(ref.current.isReady()).toBe(false);
  });

  it('retains terminal capture failure, rejects late settlement and recovers on remount', async () => {
    const prefix = [crayon, magic];
    await render(prefix, true);
    await frames();
    await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
    expect(error).toHaveBeenCalledOnce();
    expect(ref.current.isReady()).toBe(false);
    await png(0, 'too-late');
    await frames();
    expect(state.captures).toHaveLength(1);
    expect(host.querySelector('button')).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    await render(prefix, true);
    await frames();
    await png(1, 'fresh-owner');
    await load();
    expect(ref.current.isReady()).toBe(true);
  });

  it('refuses an incoming image timeout and ignores its late load', async () => {
    await render([crayon, magic, erase]);
    await frames();
    await png(0);
    const incoming = host.querySelector('button');
    await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
    expect(error).toHaveBeenCalledOnce();
    await act(async () => incoming.click());
    expect(ref.current.isReady()).toBe(false);
    expect(host.querySelector('button')).toBeNull();
  });
});

describe('SVG job cancellation identity', () => {
  it('cancels only the superseded job and refuses its old and duplicate callbacks', async () => {
    const callbacks = [];
    const capture = createSvgCapture();
    const svg = { toDataURL: (callback) => callbacks.push(callback) };
    const first = capture.capture(svg);
    const refused = first.promise.catch((failure) => failure.message);
    await frames();
    first.cancel();
    await expect(refused).resolves.toContain('superseded');
    const second = capture.capture(svg);
    await frames();
    first.cancel();
    callbacks[0]('old');
    callbacks[1]('new');
    callbacks[1]('duplicate');
    await expect(second.promise).resolves.toBe('new');
    capture.dispose();
  });
});

describe('consumed SVG raster disposal', () => {
  it.each(['success', 'empty', 'cancel', 'timeout', 'dispose'])(
    'disposes the actual request once on %s and refuses duplicate settlement',
    async (outcome) => {
      const callbacks = [],
        released = vi.fn(),
        capture = createSvgCapture();
      const job = capture.capture({
        toDataURL(callback) {
          callbacks.push(callback);
          return released;
        },
      });
      const result = job.promise.then(
        (value) => ({ value }),
        (failure) => ({ failure })
      );
      await frames();
      if (outcome === 'success') callbacks[0]('current');
      else if (outcome === 'empty') callbacks[0]('');
      else if (outcome === 'cancel') job.cancel();
      else if (outcome === 'dispose') capture.dispose();
      else await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
      const terminal = await result;
      expect(outcome === 'success' ? terminal.value : terminal.failure).toBeTruthy();
      expect(released).toHaveBeenCalledOnce();
      callbacks[0]('late');
      job.cancel();
      capture.dispose();
      expect(released).toHaveBeenCalledOnce();
    }
  );

  it('registers synchronous cleanup before resolving and preserves the first callback', async () => {
    const released = vi.fn(),
      capture = createSvgCapture();
    const job = capture.capture({
      toDataURL(callback) {
        callback('first');
        callback('duplicate');
        return released;
      },
    });
    await frames();
    await expect(job.promise).resolves.toBe('first');
    expect(released).toHaveBeenCalledOnce();
  });

  it('disposes a cleanup returned after its request was cancelled during native dispatch', async () => {
    const released = vi.fn(),
      capture = createSvgCapture();
    const job = capture.capture({
      toDataURL(callback) {
        capture.dispose();
        callback('late-sync');
        return released;
      },
    });
    const refused = job.promise.catch((failure) => failure.message);
    await frames();
    await expect(refused).resolves.toContain('cancelled');
    expect(released).toHaveBeenCalledOnce();
  });

  it('retains terminal cleanup failure without resolving a PNG or accepting another job', async () => {
    const capture = createSvgCapture();
    const job = capture.capture({
      toDataURL(callback) {
        callback('pixels');
        return () => {
          throw new Error('Resource disposal failed');
        };
      },
    });
    const refused = job.promise.catch((failure) => failure.message);
    await frames();
    await expect(refused).resolves.toContain('cleanup failed');
    await expect(capture.capture({ toDataURL() {} }).promise).rejects.toThrow('unavailable');
  });

  it('accepts the unchanged native void-return contract without claiming native resource cancellation', async () => {
    const callbacks = [],
      capture = createSvgCapture();
    const job = capture.capture({
      toDataURL(callback) {
        callbacks.push(callback);
      },
    });
    await frames();
    callbacks[0]('native-result');
    await expect(job.promise).resolves.toBe('native-result');
    capture.dispose();
  });
});
