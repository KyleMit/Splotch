// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedInkCapture } from '../../src/drawing/FixedInkCapture.tsx';
import { PictureCapture } from '../../src/drawing/PictureCapture.tsx';
import { createPngCapture } from '../../src/drawing/interactions.ts';
import { assertPngGrid, MAX_PNG_PIXELS } from '../../src/drawing/pngLimits.ts';
import { createInkObservation } from '../../src/drawing/inkCoverage.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { emptyDrawing } from '../../src/drawing/model.ts';
import { RasterInk } from '../../src/drawing/RasterInk.tsx';
import { InkPaperScope, useInkPaper } from '../../src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import {
  adoptPaper,
  paperBounds,
  paperKey,
  paperProjection,
} from '../../src/drawing/paperSpace.ts';
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
vi.mock('../../src/drawing/pictureCompose.ts', () => ({
  composePicture: async (layers, picture, includePaperTexture) => {
    state.composed.push({ layers, picture, includePaperTexture });
    return `composed:${layers.join('+')}`;
  },
}));
vi.mock('../../src/drawing/InkScene.tsx', () => ({
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
    const grid = { width: 390, height: 704 };
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

  async function exportPicture(paper, theme = 'light', kind = 'export') {
    const drawing = { ...emptyDrawing(), paper, strokes: [pen] };
    const request = createPngCapture().begin(drawing, () => true);
    const packet = {
      id: 1,
      request,
      kind,
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
      expect(state.captures[0]).toMatchObject({ ...grid, viewBox: '0 0 519 1024' });
      await act(async () => state.captures[0].callback('ink'));
      await finishOutput('ink-and-outline');
      expect(state.captures[1].options).toEqual(grid);
      await expect(request.promise).resolves.toMatchObject({ base64: 'composed:ink-and-outline' });
      expect(state.composed).toEqual([
        {
          layers: ['ink-and-outline'],
          picture: { size: grid, scale: 2, paper },
          includePaperTexture: true,
        },
      ]);
    }
  );

  it('keeps react-native-svg on iOS at the sheet it draws and composes at the screen scale', async () => {
    state.platform.OS = 'ios';
    state.pixelRatio = 3;
    const request = await exportPicture(adoptPaper(390, 769, 3));
    expect(state.captures[0].options).toEqual({ width: 390, height: 769 });
    await act(async () => state.captures[0].callback('ink'));
    await finishOutput('screen-scale-layer');
    expect(state.captures[1].options).toEqual({ width: 390, height: 769 });
    await expect(request.promise).resolves.toMatchObject({ base64: 'composed:screen-scale-layer' });
    expect(state.composed[0].picture).toMatchObject({
      size: { width: 1170, height: 2307 },
      scale: 3,
    });
  });

  // Issue 3125: react-native-svg on Android draws an image only from Fresco's memory cache, which
  // refuses a bitmap its budget has no room for, so an SVG image of the ink saved bare paper.
  it('composes the Android ink beneath the captured line art, never through an SVG image', async () => {
    state.platform.OS = 'android';
    state.pixelRatio = 2.625;
    const request = await exportPicture(adoptPaper(411.4286, 805.7143, 2.625));
    const grid = { width: 1080, height: 2114 };
    expect(state.captures[0].options).toEqual(grid);
    const images = state.svgTiles.length;
    await act(async () => state.captures[0].callback('ink'));
    await finishOutput('outline');
    expect(state.svgTiles.slice(images)).toEqual([]);
    expect(state.nativeImages.some((image) => image.resizeMethod === 'none')).toBe(false);
    expect(state.captures[1].options).toEqual(grid);
    await expect(request.promise).resolves.toMatchObject({ base64: 'composed:ink+outline' });
    expect(state.composed).toEqual([
      {
        layers: ['ink', 'outline'],
        picture: { size: grid, scale: 2.625, paper: '#fcfbf8' },
        includePaperTexture: true,
      },
    ]);
  });

  it('composes an Android picture on its capture grid over the plain paper', async () => {
    state.platform.OS = 'android';
    state.pixelRatio = 2;
    const request = await exportPicture(adoptPaper(390, 704, 2), 'dark', 'picture');
    const grid = { width: 780, height: 1408 };
    expect(state.captures[0].options).toEqual(grid);
    await act(async () => state.captures[0].callback('ink'));
    await finishOutput('outline');
    await expect(request.promise).resolves.toMatchObject({
      base64: 'composed:ink+outline',
      size: grid,
    });
    expect(state.composed).toEqual([
      {
        layers: ['ink', 'outline'],
        picture: { size: grid, scale: 2, paper: '#211f29' },
        includePaperTexture: false,
      },
    ]);
  });
});

describe('grown paper raster admission', () => {
  it.each([
    ['android', 2.625],
    ['ios', 3],
  ])('caps a %s device grid beyond the pixel budget', async (platform, density) => {
    state.platform.OS = platform;
    state.pixelRatio = density;
    const paper = adoptPaper(400, 300, density);
    const projection = paperProjection(paper, { width: 7000, height: 4000 });
    const drawing = { ...emptyDrawing(), paper, strokes: [pen] };
    const request = createPngCapture().begin(drawing, () => true);
    void request.promise.catch(() => {});
    const packet = {
      id: 1,
      request,
      kind: 'ink',
      pixelRatio: density,
      plan: {
        paper,
        projection,
        checkpoint: null,
        strokes: [pen],
        prefix: [pen],
        needsCheckpoint: false,
      },
      appearance: { pageId: 'blank', theme: 'light' },
      isCurrent: () => true,
    };
    await act(async () =>
      root.render(fixture(createElement(PictureCapture, { packet }), projection))
    );
    await flush();
    const capture = state.captures[0];
    const nativeScale = platform === 'ios' ? density : 1;
    const grid = { width: capture.width * nativeScale, height: capture.height * nativeScale };
    expect(() => assertPngGrid(grid)).not.toThrow();
    expect(grid.width * grid.height).toBeLessThanOrEqual(MAX_PNG_PIXELS);
    expect(grid.width * grid.height).toBeGreaterThan(MAX_PNG_PIXELS * 0.99);
    request.cancel('test finished');
  });

  it.each([
    ['android', 1, 400, 300, 2480, 1300],
    ['ios', 2, 500, 380, 1300, 1000],
  ])(
    'captures a grown %s paper within the real sampling budget',
    async (platform, density, width, height, grownWidth, grownHeight) => {
      state.platform.OS = platform;
      state.pixelRatio = density;
      const paper = adoptPaper(width, height, density);
      const projection = paperProjection(paper, { width: grownWidth, height: grownHeight });
      const drawing = { ...emptyDrawing(), paper, strokes: [pen] };
      const request = createPngCapture().begin(drawing, () => true);
      void request.promise.catch(() => {});
      const plan = {
        paper,
        projection,
        checkpoint: null,
        strokes: [pen],
        prefix: [pen],
        needsCheckpoint: false,
      };
      const packet = {
        id: 1,
        request,
        kind: 'ink',
        pixelRatio: density,
        plan,
        appearance: { pageId: 'blank', theme: 'light' },
        isCurrent: () => true,
      };
      await act(async () =>
        root.render(fixture(createElement(PictureCapture, { packet }), projection))
      );
      await flush();
      const capture = state.captures[0];
      const actualScale = platform === 'ios' ? density : 1;
      const grid = {
        width: capture.options.width * actualScale,
        height: capture.options.height * actualScale,
      };
      expect(grid.width * grid.height).toBeLessThanOrEqual(MAX_PNG_PIXELS);
      expect(() => assertPngGrid(grid)).not.toThrow();
      expect(capture.width * actualScale).toBe(grid.width);
      expect(capture.height * actualScale).toBe(grid.height);
      await act(async () =>
        capture.callback(rgbaPng(grid.width, grid.height, 0).toString('base64'))
      );
      const result = await request.promise;
      expect(result.size).toEqual(capture.options);
      const observations = createInkObservation();
      const observation = observations.begin(() => true, result.size);
      await expect(observation.observe(result.base64)).resolves.toBe(true);
      observations.dispose();
    }
  );
});

describe('flattened picture placement', () => {
  it.each([
    ['web', 1],
    ['ios', 2],
  ])(
    'inverts the actual %s ink capture placement before the outline pass',
    async (platform, density) => {
      state.platform.OS = platform;
      state.pixelRatio = density;
      const paper = adoptPaper(400, 725, density);
      const projection = paperProjection(paper, { width: 800.25, height: 925.5 });
      const bounds = paperBounds(projection);
      const drawing = { ...emptyDrawing(), paper, strokes: [pen] };
      const request = createPngCapture().begin(drawing, () => true);
      void request.promise.catch(() => {});
      const packet = {
        id: 1,
        request,
        kind: 'picture',
        pixelRatio: density,
        plan: {
          paper,
          projection,
          checkpoint: null,
          strokes: [pen],
          prefix: [pen],
          needsCheckpoint: false,
        },
        appearance: { pageId: 'blank', theme: 'light' },
        isCurrent: () => true,
      };
      await act(async () =>
        root.render(fixture(createElement(PictureCapture, { packet }), projection))
      );
      await flush();
      const capture = state.captures[0];
      await act(async () => capture.callback('flattened'));
      await flush();
      const image = state.svgTiles.findLast(
        ({ href }) => href === 'data:image/png;base64,flattened'
      );
      const scale = Math.min(capture.width / bounds.width, capture.height / bounds.height);
      expect(image.width / capture.width).toBeCloseTo(1 / scale, 12);
      expect(image.height / capture.height).toBeCloseTo(1 / scale, 12);
      expect(image.x + (capture.width - bounds.width * scale) / (2 * scale)).toBeCloseTo(
        bounds.x,
        12
      );
      expect(image.y + (capture.height - bounds.height * scale) / (2 * scale)).toBeCloseTo(
        bounds.y,
        12
      );
      await act(async () => state.captures[1].callback('picture'));
      await expect(request.promise).resolves.toMatchObject({
        base64: 'picture',
        size: capture.options,
      });
    }
  );
});
