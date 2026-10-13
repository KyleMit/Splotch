// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixedInkCapture } from '../../experiments/native-architecture/src/drawing/FixedInkCapture.tsx';
import { RasterInk } from '../../experiments/native-architecture/src/drawing/RasterInk.tsx';
import {
  InkPaperScope,
  useInkPaper,
} from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import {
  adoptPaper,
  paperKey,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
const state = vi.hoisted(() => ({
  captures: [],
  nativeImages: [],
  svgTiles: [],
  autoNativeTiles: true,
  autoSvgTiles: true,
  platform: { OS: 'web' },
}));
vi.mock('react-native', async () => {
  const { nativeRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeRasterSdk(state, 256);
});
vi.mock('react-native-svg', async () => {
  const { svgRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgRasterSdk(state);
});
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
      checkpoint: { id: 1, strokes: [pen], base64: 'model-only', paper: tablet },
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
});
