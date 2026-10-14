// @vitest-environment happy-dom
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { act, createElement, createRef } from 'react';
import { createPictureSurfaceFixture } from './native-picture-surface-fixture.mjs';
import {
  flushCaptureFrames,
  loadCaptureImage,
  beginFixtureOutput,
} from '../lib/native-picture-capture-sdk-fixture.mjs';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RasterInk } from '../../experiments/native-architecture/src/drawing/RasterInk.tsx';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { PictureCapture } from '../../experiments/native-architecture/src/drawing/PictureCapture.tsx';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import {
  InkAppearanceScope,
  useInkAppearance,
} from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const state = vi.hoisted(() => ({
  scheme: 'light',
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
vi.mock('react-native', async () => {
  const { nativeCaptureSdk } = await import('../lib/native-picture-capture-sdk-fixture.mjs');
  const { CRAYON_TILE_PX } =
    await import('../../experiments/native-architecture/src/drawing/crayon.ts');
  return nativeCaptureSdk(state, CRAYON_TILE_PX);
});
vi.mock('react-native-svg', async () => {
  const { svgCaptureSdk } = await import('../lib/native-picture-capture-sdk-fixture.mjs');
  const { CRAYON_TILE_PX } =
    await import('../../experiments/native-architecture/src/drawing/crayon.ts');
  return svgCaptureSdk(state, CRAYON_TILE_PX);
});
vi.mock('../../experiments/native-architecture/src/drawing/InkScene.tsx', () => ({
  InkScene: ({ checkpoint, strokes, onImageLoad }) => {
    const appearance = useInkAppearance();
    if (checkpoint) state.imageLoads.push({ checkpoint, onImageLoad });
    return createElement(
      'div',
      {
        'data-strokes': strokes.map((stroke) => stroke.brush).join(','),
        'data-appearance': `${appearance.pageId}:${appearance.theme}`,
      },
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
  pageHasOutline: () => true,
  PageOutline: ({ pageId }) => createElement('div', { 'data-page': pageId }),
  usePageOutlineReady: () => true,
}));

const LEGAL_REPLAY_TEST_TIMEOUT_MS = 30_000;
const crayon = { brush: 'crayon', width: 34, color: 'Blue', seed: 17, points: [{ x: 40, y: 40 }] };
const magic = { brush: 'magic', width: 30, rainbow: 3, points: [{ x: 60, y: 60 }] };
const marker = { brush: 'marker', width: 22, color: 'Yellow', points: [{ x: 80, y: 80 }] };
const erase = { brush: 'eraser', width: 44, points: [{ x: 960, y: 740 }] };
let root, host, ref, error, busy;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  state.captures.length = 0;
  state.nativeImages.length = 0;
  state.platform.OS = 'web';
  state.scheme = 'light';
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
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme: 'light' } },
        createElement(RasterInk, {
          ref,
          strokes,
          drafts: draft ? [draft] : [],
          brush: prepareEraser ? 'eraser' : 'pen',
          color: 'Blue',
          onError: error,
          onBusy: busy,
        })
      )
    )
  );
}
const frames = () => flushCaptureFrames(state);
async function png(index, value = 'transparent-png') {
  await act(async () => state.captures[index].callback(value));
}
const load = (width) => loadCaptureImage(host, width);

describe('ready-owner output handoff', () => {
  it('rejects draft and equal-length replacement identities without changing a pinned plan', async () => {
    const strokes = [marker];
    await render(strokes);
    const plan = ref.current.readyPlan(strokes);
    expect(() => ref.current.readyPlan([{ ...marker }])).toThrow('still being prepared');
    await render(strokes, false, magic);
    expect(host.querySelector('[data-strokes="marker,magic"]')).not.toBeNull();
    const renderedWithDraft = [...strokes, magic];
    expect(() => ref.current.readyPlan(renderedWithDraft)).toThrow('still being prepared');
    await render(strokes);
    expect(ref.current.readyPlan(strokes).strokes).toEqual(strokes);
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
      const request = createPngCapture().begin({ ...legacyDrawing(), strokes });
      const completion = request.promise.then(
        (value) => ({ value }),
        (failure) => ({ failure })
      );
      const packet = {
        id: 1,
        request,
        kind: 'ink',
        plan,
        appearance: { pageId: 'blank', theme: 'light' },
        isCurrent: () => true,
      };
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

const surface = createPictureSurfaceFixture({
  DrawingAppearanceProvider,
  DrawingSurface,
  createSpy: vi.fn,
  readMount: () => ({ root, ref, error, busy }),
});

const beginOutput = (drawing, kind) => beginFixtureOutput(ref, drawing, kind);

describe('mounted canonical output identity', () => {
  it.each(['system', 'light'])(
    'supersedes capture after resolved %s appearance changes and rejects late output',
    async (preference) => {
      const drawing = { ...legacyDrawing(3, 'flower'), strokes: [magic] };
      await surface(drawing, preference);
      const first = await beginOutput(drawing);
      const refused = first.promise.catch((failure) => failure.message);
      await frames();
      const oldPacket = state.packets.at(-1);
      expect(oldPacket.appearance).toEqual({ pageId: 'flower', theme: 'light' });
      state.scheme = 'dark';
      await surface(drawing, preference);
      expect(oldPacket.isCurrent()).toBe(preference === 'light');
      await surface(drawing, preference === 'system' ? 'system' : 'dark');
      await expect(refused).resolves.toContain('changed');
      expect(oldPacket.isCurrent()).toBe(false);
      await png(0, 'stale-light-output');
      first.release();
      const second = await beginOutput(drawing);
      await frames();
      expect(state.packets.at(-1).appearance).toEqual({ pageId: 'flower', theme: 'dark' });
      await png(1, 'current-dark-output');
      await expect(second.promise).resolves.toBe('current-dark-output');
      expect(drawing.strokes).toEqual([magic]);
      second.release();
    }
  );

  it('discards a pending raster prefix when appearance changes before its late SDK callback', async () => {
    const drawing = { ...legacyDrawing(3, 'flower'), strokes: [magic, erase] };
    await surface(drawing);
    await frames();
    expect(state.captures).toHaveLength(1);
    state.scheme = 'dark';
    await surface(drawing);
    await frames();
    expect(state.captures).toHaveLength(2);
    await png(0, 'late-old-light-prefix');
    expect(host.querySelector('[data-checkpoint]')).toBeNull();
    expect(error).not.toHaveBeenCalled();
    await png(1, 'current-dark-prefix');
    await load();
    expect(
      host.querySelector('[data-appearance="flower:dark"][data-strokes="eraser"]')
    ).not.toBeNull();
    expect(state.captures).toHaveLength(2);
  });

  it.each(['page', 'theme'])(
    'replays semantic ink after a settled erased prefix changes %s',
    async (change) => {
      const drawing = { ...legacyDrawing(3, 'flower'), strokes: [magic, erase] };
      await surface(drawing);
      await frames();
      await png(0, 'old-flattened-prefix');
      await load();
      expect(state.captures).toHaveLength(1);
      const replacement = change === 'page' ? { ...drawing, pageId: 'turtle' } : drawing;
      state.scheme = change === 'theme' ? 'dark' : 'light';
      await surface(replacement);
      await frames();
      expect(state.captures).toHaveLength(2);
      expect(state.captures[1].children.props.checkpoint).toBeNull();
      expect(state.captures[1].children.props.strokes).toEqual([magic]);
      expect(
        host.querySelector(`[data-appearance="${replacement.pageId}:${state.scheme}"]`)
      ).not.toBeNull();
      await png(1, 'recoded-prefix');
      await load();
      expect(error).not.toHaveBeenCalled();
      expect(replacement.strokes).toBe(drawing.strokes);
    }
  );

  it('requires a command lease and the exact rendered Drawing snapshot', async () => {
    const drawing = { ...legacyDrawing(), strokes: [marker] };
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
    const drawing = { ...legacyDrawing(), strokes: [marker] };
    await surface(drawing);
    const first = await beginOutput(drawing);
    const refused = first.promise.catch((failure) => failure.message);
    await frames();
    const replacement = { ...legacyDrawing(3, 'flower'), strokes: [magic] };
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
    const drawing = { ...legacyDrawing(), strokes: [marker] };
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
    const drawing = { ...legacyDrawing(), strokes: [marker, erase] };
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
    const drawing = { ...legacyDrawing(), strokes: [marker] };
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
    const drawing = { ...legacyDrawing(), strokes: [marker] };
    await surface(drawing);
    const { promise, release } = await beginOutput(drawing);
    const refused = promise.catch((failure) => failure.message);
    await frames();
    release();
    await png(0, 'after-lease');
    await expect(refused).resolves.toContain('changed');
  });

  it.each(['light', 'dark'])(
    'uses resolved %s paper and page outlines only in picture output',
    async (preference) => {
      const drawing = { ...legacyDrawing(0, 'flower'), strokes: [marker] };
      await surface(drawing, preference);
      const { promise, release } = await beginOutput(drawing, 'capturePng');
      await frames();
      expect(host.querySelector('[data-paper-fill]')).toBeNull();
      await png(0, 'transparent-ink');
      expect(host.querySelector('[data-paper-fill]').dataset.paperFill).toBe(
        preference === 'dark' ? '#211f29' : '#fcfbf8'
      );
      expect(host.querySelectorAll('[data-page="flower"]')).toHaveLength(2);
      expect(state.captures).toHaveLength(1);
      await act(async () => host.querySelector('[data-output-image]').click());
      await frames();
      expect(state.captures[1]).toMatchObject({
        width: 1024,
        height: 768,
        viewBox: '0 0 1024 768',
      });
      await png(1, 'paper-ink-outline');
      await expect(promise).resolves.toBe('paper-ink-outline');
      release();
    }
  );

  it('cancels an unmounted output owner and refuses its callback after a new screen mounts', async () => {
    const drawing = { ...legacyDrawing(), strokes: [marker] };
    await surface(drawing);
    const first = await beginOutput(drawing);
    const refused = first.promise.catch((failure) => failure.message);
    await frames();
    act(() => root.unmount());
    await expect(refused).resolves.toContain('cancelled');
    root = createRoot(host);
    const replacement = { ...legacyDrawing(3), strokes: [magic] };
    await surface(replacement);
    const second = await beginOutput(replacement);
    await frames();
    await png(0, 'unmounted-output');
    await png(1, 'new-screen-output');
    await expect(second.promise).resolves.toBe('new-screen-output');
    second.release();
  });

  it('retains canonical ink after a bounded output timeout and ignores late settlement', async () => {
    const drawing = { ...legacyDrawing(), strokes: [marker] };
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
  const drawing = { ...legacyDrawing(), strokes: [crayon, erase] };
  const decode = async () => {
    const image = state.nativeImages.findLast((image) => image.resizeMethod === 'none');
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
