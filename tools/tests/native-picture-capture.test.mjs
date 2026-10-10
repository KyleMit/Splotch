// @vitest-environment happy-dom
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RasterInk } from '../../experiments/native-architecture/src/drawing/RasterInk.tsx';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { PictureCapture } from '../../experiments/native-architecture/src/drawing/PictureCapture.tsx';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const state = vi.hoisted(() => ({
  captures: [],
  nativeImages: [],
  platform: { OS: 'web' },
  packets: [],
  imageLoads: [],
  responders: [],
  layouts: [],
  frames: new Map(),
  nextFrame: 0,
}));
vi.mock('react-native', () => ({
  Platform: state.platform,
  Image: (props) => {
    state.nativeImages.push(props);
    return null;
  },
  findNodeHandle: (target) => target,
  View: forwardRef(({ children, style, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    if (onLayout) state.layouts.push(onLayout);
    return createElement('div', { style }, children);
  }),
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
  PanResponder: {
    create: (responder) => {
      state.responders.push(responder);
      return { panHandlers: {} };
    },
  },
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
  Rect: ({ fill }) => createElement('div', { 'data-paper-fill': fill }),
  Image: ({ onLoad, href }) =>
    createElement('button', { 'data-output-image': href, onClick: onLoad }),
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

vi.mock(
  '../../experiments/native-architecture/src/drawing/PictureCapture.tsx',
  async (loadOriginal) => {
    const actual = await loadOriginal();
    return {
      ...actual,
      PictureCapture: (props) => {
        state.packets.push(props.packet);
        return createElement(actual.PictureCapture, props);
      },
    };
  }
);

vi.mock('../../experiments/native-architecture/src/drawing/PageOutline.tsx', () => ({
  PageOutline: ({ pageId }) => createElement('div', { 'data-page': pageId }),
}));

const LEGAL_REPLAY_TEST_TIMEOUT_MS = 30_000;
const crayon = { brush: 'crayon', color: 'Blue', seed: 17, points: [{ x: 40, y: 40 }] };
const magic = { brush: 'magic', rainbow: 3, points: [{ x: 60, y: 60 }] };
const marker = { brush: 'marker', color: 'Yellow', points: [{ x: 80, y: 80 }] };
const erase = { brush: 'eraser', points: [{ x: 960, y: 740 }] };
let root, host, ref, error, busy;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  state.captures.length = 0;
  state.nativeImages.length = 0;
  state.platform.OS = 'web';
  state.packets.length = 0;
  state.imageLoads.length = 0;
  state.responders.length = 0;
  state.layouts.length = 0;
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

describe('ready-owner output handoff', () => {
  it('rejects draft and equal-length replacement identities without changing a pinned plan', async () => {
    const strokes = [marker];
    await render(strokes);
    const plan = ref.current.readyPlan(strokes);
    expect(() => ref.current.readyPlan([{ ...marker }])).toThrow('still being prepared');
    await render(strokes, false, magic);
    expect(() => ref.current.readyPlan([...strokes, magic])).toThrow('still being prepared');
    await render([crayon]);
    expect(plan.strokes).toEqual(strokes);
    expect(() => ref.current.readyPlan(strokes)).toThrow('still being prepared');
  });

  it(
    'replays 1000 legal operations once and exports the established ready checkpoint once',
    async () => {
      const strokes = Array.from({ length: 1000 }, (_, index) => (index % 2 ? erase : marker));
      await render(strokes);
      for (let index = 0; index < 500; index += 1) {
        await frames();
        expect(state.captures).toHaveLength(index + 1);
        await png(index, `chronological-prefix-${index}`);
        await load();
        if (index < 499) await load('1024');
      }
      expect(ref.current.isReady()).toBe(true);
      const plan = ref.current.readyPlan(strokes);
      expect(plan.checkpoint.strokes).toHaveLength(999);
      expect(plan.strokes).toEqual([erase]);
      const request = createPngCapture().begin({ ...emptyDrawing(), strokes });
      const completion = request.promise.then(
        (value) => ({ value }),
        (failure) => ({ failure })
      );
      const packet = { id: 1, request, kind: 'ink', plan, isCurrent: () => true };
      await act(async () => root.render(createElement(PictureCapture, { packet })));
      expect(host.querySelector('[data-paper-fill]')).toBeNull();
      expect(host.querySelector('[data-page]')).toBeNull();
      await frames();
      expect(state.captures).toHaveLength(500);
      await load('1024');
      await frames();
      expect(state.captures).toHaveLength(501);
      expect(state.captures[500].children.props.checkpoint).toBe(plan.checkpoint);
      expect(state.captures[500].children.props.strokes).toBe(plan.strokes);
      await png(500, 'ready-output');
      await expect(completion).resolves.toEqual({ value: 'ready-output' });
    },
    LEGAL_REPLAY_TEST_TIMEOUT_MS
  );
});

async function surface(drawing) {
  await act(async () =>
    root.render(
      createElement(DrawingSurface, {
        ref,
        drawing,
        currentDrawing: () => drawing,
        color: 'Blue',
        brush: 'marker',
        disabled: false,
        onCohort: vi.fn(),
        onDrawingChange: vi.fn(),
        onPreparingChange: busy,
        onError: error,
      })
    )
  );
}

async function beginOutput(drawing, kind = 'captureInk') {
  const release = ref.current.lockInput();
  let promise;
  await act(async () => {
    promise = ref.current[kind](drawing);
  });
  return { promise, release };
}

describe('mounted canonical output identity', () => {
  it('requires a command lease and the exact rendered Drawing snapshot', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    await expect(ref.current.captureInk(drawing)).rejects.toThrow('not ready');
    const release = ref.current.lockInput();
    let refusal;
    await act(async () => {
      void ref.current.captureInk({ ...drawing }).catch((error) => {
        refusal = error;
      });
    });
    expect(refusal?.message).toContain('not ready');
    expect(state.captures).toHaveLength(0);
    release();
  });

  it('cancels a replaced Drawing and refuses its late callback before allowing current output', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    const first = await beginOutput(drawing);
    const refused = first.promise.catch((failure) => failure.message);
    await frames();
    const replacement = { ...emptyDrawing(3, 'flower'), strokes: [magic] };
    await surface(replacement);
    await expect(refused).resolves.toContain('changed');
    await png(0, 'old-output');
    first.release();
    const second = await beginOutput(replacement);
    await frames();
    await png(1, 'current-output');
    await expect(second.promise).resolves.toBe('current-output');
    second.release();
  });

  it('remounts a same-kind terminal packet replaced before its owner cleans up', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    const first = await beginOutput(drawing);
    await frames();
    const packet = state.packets.at(-1);
    let second;
    await act(async () => {
      expect(packet.request.complete('first-output')).toBe(true);
      first.release();
      const release = ref.current.lockInput();
      second = { release, promise: ref.current.captureInk(drawing) };
      void second.promise.catch(() => {});
    });
    await expect(first.promise).resolves.toBe('first-output');
    expect(state.packets.at(-1).id).not.toBe(packet.id);
    await frames();
    expect(state.captures).toHaveLength(2);
    await png(0, 'late-first-callback');
    await png(1, 'second-output');
    await expect(second.promise).resolves.toBe('second-output');
    second.release();
  });

  it('refuses output throughout checkpoint capture and incoming-image readiness', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker, erase] };
    await surface(drawing);
    const release = ref.current.lockInput();
    await expect(ref.current.captureInk(drawing)).rejects.toThrow('still being prepared');
    await frames();
    await png(0, 'prepared-prefix');
    await expect(ref.current.captureInk(drawing)).rejects.toThrow('still being prepared');
    await load();
    release();
    const output = await beginOutput(drawing);
    await load('1024');
    await frames();
    await png(1, 'current-ink');
    await expect(output.promise).resolves.toBe('current-ink');
    output.release();
  });

  it('refuses output while the original pointer owns a draft', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    await act(async () =>
      state.layouts.at(-1)({ nativeEvent: { layout: { width: 1024, height: 768 } } })
    );
    const responder = state.responders[0];
    const touch = {
      identifier: 'finger',
      locationX: 20,
      locationY: 30,
      pageX: 20,
      pageY: 30,
      target: 101,
      timestamp: 100,
    };
    const start = {
      currentTarget: 101,
      nativeEvent: { touches: [touch], changedTouches: [touch], target: 101 },
      touchHistory: {
        touchBank: { finger: { touchActive: true, startTimeStamp: 100 } },
        mostRecentTimeStamp: 100,
      },
    };
    await act(async () => {
      responder.onPanResponderGrant(start);
      responder.onPanResponderStart(start);
    });
    expect(() => ref.current.lockInput()).toThrow('Finish drawing');
    await expect(ref.current.captureInk(drawing)).rejects.toThrow('Lift your finger');
  });

  it('refuses completion after its input lease expires', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    const { promise, release } = await beginOutput(drawing);
    const refused = promise.catch((failure) => failure.message);
    await frames();
    release();
    await png(0, 'after-lease');
    await expect(refused).resolves.toContain('changed');
  });

  it('keeps white paper and page outlines in picture output only', async () => {
    const drawing = { ...emptyDrawing(0, 'flower'), strokes: [marker] };
    await surface(drawing);
    const { promise, release } = await beginOutput(drawing, 'capturePng');
    await frames();
    expect(host.querySelector('[data-paper-fill]')).toBeNull();
    await png(0, 'transparent-ink');
    expect(host.querySelector('[data-paper-fill]')).not.toBeNull();
    expect(host.querySelectorAll('[data-page="flower"]')).toHaveLength(2);
    expect(state.captures).toHaveLength(1);
    await act(async () => host.querySelector('[data-output-image]').click());
    await frames();
    expect(state.captures[1]).toMatchObject({ width: 1024, height: 768, viewBox: '0 0 1024 768' });
    await png(1, 'paper-ink-outline');
    await expect(promise).resolves.toBe('paper-ink-outline');
    release();
  });

  it('cancels an unmounted output owner and refuses its callback after a new screen mounts', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    const first = await beginOutput(drawing);
    const refused = first.promise.catch((failure) => failure.message);
    await frames();
    act(() => root.unmount());
    await expect(refused).resolves.toContain('cancelled');
    root = createRoot(host);
    const replacement = { ...emptyDrawing(3), strokes: [magic] };
    await surface(replacement);
    const second = await beginOutput(replacement);
    await frames();
    await png(0, 'unmounted-output');
    await png(1, 'new-screen-output');
    await expect(second.promise).resolves.toBe('new-screen-output');
    second.release();
  });

  it('retains canonical ink after a bounded output timeout and ignores late settlement', async () => {
    const drawing = { ...emptyDrawing(), strokes: [marker] };
    await surface(drawing);
    const { promise, release } = await beginOutput(drawing);
    const refused = promise.catch((failure) => failure.message);
    await frames();
    await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
    await expect(refused).resolves.toMatch(/did not finish/);
    await png(0, 'too-late');
    expect(host.querySelector('[data-strokes="marker"]')).not.toBeNull();
    release();
  });
});

it('loads cached Android checkpoints and flattened output through decoded RN callbacks', async () => {
  state.platform.OS = 'android';
  const drawing = { ...emptyDrawing(), strokes: [crayon, erase] };
  const decode = async () => {
    const image = state.nativeImages.at(-1);
    await act(async () =>
      image.onLoad({ nativeEvent: { source: { uri: image.source.uri, width: 1024, height: 768 } } })
    );
  };
  await surface(drawing);
  await frames();
  await png(0, 'cached-prefix');
  await decode();
  const { promise, release } = await beginOutput(drawing, 'capturePng');
  await frames();
  expect(state.captures).toHaveLength(1);
  await load('1024');
  await frames();
  expect(state.captures).toHaveLength(1);
  await decode();
  await frames();
  expect(state.captures).toHaveLength(2);
  await png(1, 'flattened-ink');
  expect(state.captures).toHaveLength(2);
  expect(host.querySelector('[data-output-image]').dataset.outputImage).toBe(
    'data:image/png;base64,flattened-ink'
  );
  await act(async () => host.querySelector('[data-output-image]').click());
  await frames();
  expect(state.captures).toHaveLength(2);
  await decode();
  await frames();
  expect(state.captures).toHaveLength(3);
  await png(2, 'picture-output');
  await expect(promise).resolves.toBe('picture-output');
  expect(error).not.toHaveBeenCalled();
  release();
});
