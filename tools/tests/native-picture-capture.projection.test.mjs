// @vitest-environment happy-dom
import {
  adoptPaper,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { act, createElement, createRef } from 'react';
import { createPictureSurfaceFixture } from './native-picture-surface-fixture.mjs';
import {
  flushCaptureFrames,
  loadCaptureImage,
  beginFixtureOutput,
  installCaptureFrames,
} from '../lib/native-picture-capture-sdk-fixture.mjs';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { useInkAppearance } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';

const state = vi.hoisted(() => ({
  scheme: 'light',
  captures: [],
  nativeImages: [],
  platform: { OS: 'web' },
  packets: [],
  imageLoads: [],
  inputs: [],
  layouts: [],
  frames: new Map(),
  nextFrame: 0,
}));
vi.mock('../../experiments/native-architecture/src/drawing/pictureCompose.ts', () => ({
  composePicture: async (layers) => layers.join('+'),
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

const crayon = { brush: 'crayon', width: 34, color: 'Blue', seed: 17, points: [{ x: 40, y: 40 }] };
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
  state.inputs.length = 0;
  state.layouts.length = 0;
  installCaptureFrames(state, vi);
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
const frames = () => flushCaptureFrames(state);
async function png(index, value = 'transparent-png') {
  await act(async () => state.captures[index].callback(value));
}
const load = (width) => loadCaptureImage(host, width);

const surface = createPictureSurfaceFixture({
  DrawingAppearanceProvider,
  DrawingSurface,
  createSpy: vi.fn,
  readMount: () => ({ root, ref, error, busy }),
});

const beginOutput = (drawing, kind) => beginFixtureOutput(ref, drawing, kind);

it.each([
  ['capturePng', 1024, 768],
  ['exportPng', 2048, 1536],
])(
  'loads cached Android checkpoints through their decoded grids and composes the flattened %s ink',
  async (kind, width, height) => {
    state.platform.OS = 'android';
    const drawing = { ...legacyDrawing(), strokes: [crayon, erase] };
    const decode = async (width = 1024, height = 768) => {
      const image = state.nativeImages.findLast((image) => image.resizeMethod === 'none');
      await act(async () =>
        image.onLoad({ nativeEvent: { source: { uri: image.source.uri, width, height } } })
      );
    };
    await surface(drawing);
    await frames();
    await png(0, 'cached-prefix');
    await decode();
    const { promise, release } = await beginOutput(drawing, kind);
    void promise.catch(() => {});
    await frames();
    expect(state.captures).toHaveLength(1);
    await load(String(width));
    await frames();
    expect(state.captures).toHaveLength(1);
    await decode();
    await frames();
    expect(state.captures).toHaveLength(2);
    await png(1, 'flattened-ink');
    expect(host.querySelector('[data-output-image]')).toBeNull();
    await frames();
    expect(state.captures).toHaveLength(3);
    expect(state.captures[2].options).toEqual({ width, height });
    await png(2, 'picture-output');
    await expect(
      promise.then((result) => (typeof result === 'string' ? result : result.base64))
    ).resolves.toBe('flattened-ink+picture-output');
    expect(error).not.toHaveBeenCalled();
    release();
  }
);

it('pins resized AI output size and rejects a late result after the extent changes', async () => {
  const paper = adoptPaper(400, 800, 2);
  const drawing = {
    ...emptyDrawing(),
    paper,
    strokes: [{ brush: 'pen', color: 'Blue', width: 22, points: [{ x: 128, y: 256 }] }],
  };
  const resized = paperProjection(paper, { width: 800, height: 1000 });
  await surface(drawing, 'light', resized);
  const first = await beginOutput(drawing, 'captureAiPng');
  const refused = first.promise.catch((failure) => failure.message);
  await frames();
  const packet = state.packets.at(-1);
  expect(packet.plan.projection).toBe(resized);
  expect(packet.pixelRatio).toBe(1);
  expect(state.captures.at(-1).options).toEqual({ width: 1600, height: 2000 });
  const oldIndex = state.captures.length - 1;
  await surface(drawing, 'light', paperProjection(paper, { width: 900, height: 1100 }));
  expect(packet.isCurrent()).toBe(false);
  await png(oldIndex, 'stale-extent');
  await expect(refused).resolves.toContain('changed');
  await act(async () => first.release());
  const second = await beginOutput(drawing, 'captureAiPng');
  await frames();
  await png(state.captures.length - 1, 'current-ink');
  await load('1800');
  await frames();
  expect(state.captures.at(-1).options).toEqual({ width: 1800, height: 2200 });
  await png(state.captures.length - 1, 'current-picture');
  await expect(second.promise).resolves.toMatchObject({ size: { width: 1800, height: 2200 } });
  await act(async () => second.release());
});
