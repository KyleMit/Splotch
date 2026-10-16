// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedInkCapture } from '../../experiments/native-architecture/src/drawing/FixedInkCapture.tsx';
import { PictureCapture } from '../../experiments/native-architecture/src/drawing/PictureCapture.tsx';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { RasterInk } from '../../experiments/native-architecture/src/drawing/RasterInk.tsx';
import {
  InkPaperScope,
  useInkPaper,
} from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import {
  adoptPaper,
  paperKey,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
const state = vi.hoisted(() => ({
  captures: [],
  nativeImages: [],
  svgTiles: [],
  autoNativeTiles: true,
  autoSvgTiles: true,
  platform: { OS: 'web' },
  pixelRatio: 1,
  composed: [],
}));
vi.mock('react-native', async () => {
  const { nativeRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeRasterSdk(state, 256);
});
vi.mock('react-native-svg', async () => {
  const { svgRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgRasterSdk(state);
});
vi.mock('../../experiments/native-architecture/src/drawing/pictureCompose.ts', () => ({
  composePicture: async (layer, picture) => {
    state.composed.push({ layer, picture });
    return `composed:${layer}`;
  },
}));
vi.mock('../../experiments/native-architecture/src/drawing/InkScene.tsx', () => ({
  InkScene: ({ checkpoint, strokes }) =>
    createElement('div', {
      'data-paper-reference': paperKey(useInkPaper()),
      'data-checkpoint': checkpoint?.base64 ?? '',
      'data-strokes': strokes.length,
    }),
}));
const phone = adoptPaper(342, 256.5, 1);
const tablet = adoptPaper(760, 570, 2);
const pen = { brush: 'pen', color: 'Red', width: 22, points: [{ x: 512, y: 384 }] };
let root, host, frames;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.captures.length = 0;
  state.nativeImages.length = 0;
  state.svgTiles.length = 0;
  state.composed.length = 0;
  state.platform.OS = 'web';
  state.pixelRatio = 1;
  frames = new Map();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++next;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture(child, paper = tablet) {
  return createElement(
    InkAppearanceScope.Provider,
    { value: { pageId: 'blank', theme: 'light' } },
    createElement(InkPaperScope.Provider, { value: paper }, child)
  );
}
async function flush() {
  for (let count = 0; count < 2; count += 1)
    await act(async () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    });
}

describe('snapshot paper ownership through asynchronous capture', () => {
  it('renders a fixed snapshot using its own paper rather than a later ambient reference', async () => {
    const onReady = vi.fn();
    const plan = {
      paper: phone,
      projection: paperProjection(phone),
      checkpoint: null,
      strokes: [pen],
      prefix: [pen],
      needsCheckpoint: false,
    };
    await act(async () =>
      root.render(
        fixture(
          createElement(FixedInkCapture, { plan, svgRef: createRef(), onReady, onError: vi.fn() })
        )
      )
    );
    expect(host.querySelector('[data-paper-reference]').dataset.paperReference).toBe(
      paperKey(phone)
    );
    expect(onReady).toHaveBeenCalled();
  });

  it('rejects a checkpoint that belongs to another paper before rendering it', async () => {
    const plan = {
      paper: phone,
      projection: paperProjection(phone),
      checkpoint: {
        id: 1,
        strokes: [pen],
        base64: 'model-only',
        paper: tablet,
        projection: paperProjection(tablet),
      },
      strokes: [],
      prefix: [pen],
      needsCheckpoint: false,
    };
    const { renderToStaticMarkup } = await import('react-dom/server');
    expect(() =>
      renderToStaticMarkup(
        fixture(
          createElement(FixedInkCapture, { plan, svgRef: createRef(), onReady() {}, onError() {} })
        )
      )
    ).toThrow('paper reference');
  });

  it('invalidates an in-flight checkpoint when its paper changes and ignores its late completion', async () => {
    const ref = createRef();
    const error = vi.fn();
    const props = {
      ref,
      strokes: [pen],
      brush: 'eraser',
      color: 'Red',
      onBusy: vi.fn(),
      onError: error,
    };
    await act(async () => root.render(fixture(createElement(RasterInk, props), phone)));
    await flush();
    expect(state.captures).toHaveLength(1);
    const stale = state.captures[0];
    await act(async () => root.render(fixture(createElement(RasterInk, props), tablet)));
    await flush();
    await act(async () => stale.callback('stale-paper-pixels'));
    expect(
      [...host.querySelectorAll('[data-paper-reference]')].every(
        (node) => node.dataset.paperReference === paperKey(tablet)
      )
    ).toBe(true);
    expect(host.querySelector('[data-checkpoint="stale-paper-pixels"]')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('exports a portrait picture at its own shape, through both capture passes', async () => {
    const portrait = adoptPaper(390, 704, 3);
    const drawing = { ...emptyDrawing(), paper: portrait, strokes: [pen] };
    const request = createPngCapture().begin(drawing, () => true);
    const plan = {
      paper: portrait,
      projection: paperProjection(portrait),
      checkpoint: null,
      strokes: [pen],
      prefix: [pen],
      needsCheckpoint: false,
    };
    const complete = vi.spyOn(request, 'complete');
    const packet = {
      id: 1,
      request,
      kind: 'picture',
      pixelRatio: state.pixelRatio,
      plan,
      appearance: { pageId: 'blank', theme: 'light' },
      isCurrent: () => true,
    };
    await act(async () => root.render(fixture(createElement(PictureCapture, { packet }))));
    await flush();
    const grid = { width: 567, height: 1024 };
    expect(state.captures).toHaveLength(1);
    expect(state.captures[0].options).toEqual(grid);
    expect(state.captures[0]).toMatchObject({ ...grid, viewBox: '0 0 567 1024' });
    await act(async () => state.captures[0].callback('portrait-ink'));
    await flush();
    expect(state.captures).toHaveLength(2);
    expect(state.captures[1].options).toEqual(grid);
    expect(state.captures[1]).toMatchObject({ ...grid, viewBox: '0 0 567 1024' });
    await act(async () => state.captures[1].callback('portrait-picture'));
    await expect(request.promise).resolves.toMatchObject({ base64: 'portrait-picture' });
    expect(complete).toHaveBeenCalledExactlyOnceWith('portrait-picture', grid);
    expect(state.composed).toEqual([]);
  });
});

describe('the saved picture', () => {
  // The 390x844 phone's paper: a 519x1024 sheet that shipping saves at 780x1538 on a 1x screen.
  const phonePaper = adoptPaper(390, 769, 1);
  const sheet = { width: 519, height: 1024 };

  async function exportPicture(paper, theme = 'light') {
    const drawing = { ...emptyDrawing(), paper, strokes: [pen] };
    const request = createPngCapture().begin(drawing, () => true);
    const packet = {
      id: 1,
      request,
      kind: 'export',
      pixelRatio: state.pixelRatio,
      plan: {
        paper,
        projection: paperProjection(paper),
        checkpoint: null,
        strokes: [pen],
        prefix: [pen],
        needsCheckpoint: false,
      },
      appearance: { pageId: 'blank', theme },
      isCurrent: () => true,
    };
    await act(async () => root.render(fixture(createElement(PictureCapture, { packet }), paper)));
    await flush();
    return request;
  }

  async function finishOutput(layer) {
    await flush();
    expect(state.captures).toHaveLength(2);
    expect(host.querySelector('[data-paper-fill]')).toBeNull();
    await act(async () => state.captures[1].callback(layer));
  }

  it.each([
    ['light', '#fcfbf8'],
    ['dark', '#211f29'],
  ])(
    'rasterizes both web passes at the shipping grid and composes them over the %s paper',
    async (theme, paper) => {
      const grid = { width: 780, height: 1538 };
      const request = await exportPicture(phonePaper, theme);
      expect(state.captures[0].options).toEqual(grid);
      expect(state.captures[0]).toMatchObject({ ...sheet, viewBox: '0 0 519 1024' });
      await act(async () => state.captures[0].callback('ink'));
      await finishOutput('ink-and-outline');
      expect(state.captures[1].options).toEqual(grid);
      await expect(request.promise).resolves.toMatchObject({ base64: 'composed:ink-and-outline' });
      expect(state.composed).toEqual([
        { layer: 'ink-and-outline', picture: { size: grid, scale: 2, paper } },
      ]);
    }
  );

  it('keeps react-native-svg on iOS at the sheet it draws and composes at the screen scale', async () => {
    state.platform.OS = 'ios';
    state.pixelRatio = 3;
    const request = await exportPicture(adoptPaper(390, 769, 3));
    expect(state.captures[0].options).toEqual(sheet);
    await act(async () => state.captures[0].callback('ink'));
    await finishOutput('screen-scale-layer');
    expect(state.captures[1].options).toEqual(sheet);
    await expect(request.promise).resolves.toMatchObject({ base64: 'composed:screen-scale-layer' });
    expect(state.composed[0].picture).toMatchObject({
      size: { width: 1170, height: 2307 },
      scale: 3,
    });
  });

  it('decodes the Android ink pass at the shipping grid before composing', async () => {
    state.platform.OS = 'android';
    state.pixelRatio = 2.625;
    const request = await exportPicture(adoptPaper(411.4286, 805.7143, 2.625));
    const grid = { width: 1080, height: 2114 };
    expect(state.captures[0].options).toEqual(grid);
    await act(async () => state.captures[0].callback('ink'));
    const decoded = state.nativeImages.findLast((image) => image.resizeMethod === 'none');
    await act(async () =>
      decoded.onLoad({ nativeEvent: { source: { uri: decoded.source.uri, ...grid } } })
    );
    await finishOutput('android-layer');
    expect(state.captures[1].options).toEqual(grid);
    await expect(request.promise).resolves.toMatchObject({ base64: 'composed:android-layer' });
    expect(state.composed[0].picture).toMatchObject({ size: grid, scale: 2.625 });
  });
});
