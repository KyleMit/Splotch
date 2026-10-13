// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RasterInk } from '../../experiments/native-architecture/src/drawing/RasterInk.tsx';
import {
  InkAppearanceScope,
  useInkAppearance,
} from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { CRAYON_TILE_PX } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const state = vi.hoisted(() => ({
  captures: [],
  imageLoads: [],
  nativeImages: [],
  svgTiles: [],
  autoNativeTiles: true,
  autoSvgTiles: true,
  platform: { OS: 'web' },
  frames: new Map(),
  nextFrame: 0,
}));
vi.mock('react-native', async () => {
  const { nativeRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  const { CRAYON_TILE_PX } =
    await import('../../experiments/native-architecture/src/drawing/crayon.ts');
  return nativeRasterSdk(state, CRAYON_TILE_PX);
});
vi.mock('react-native-svg', async () => {
  const { svgRasterSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgRasterSdk(state);
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

const crayon = { brush: 'crayon', width: 34, color: 'Blue', seed: 17, points: [{ x: 40, y: 40 }] };
const magic = { brush: 'magic', width: 30, rainbow: 3, points: [{ x: 60, y: 60 }] };
const marker = { brush: 'pen', width: 22, color: 'Yellow', points: [{ x: 80, y: 80 }] };
const erase = { brush: 'eraser', width: 44, points: [{ x: 960, y: 740 }] };
let root, host, ref, error, busy;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  state.captures.length = 0;
  state.nativeImages.length = 0;
  state.svgTiles.length = 0;
  state.autoNativeTiles = true;
  state.autoSvgTiles = true;
  state.platform.OS = 'web';
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
function rasterFixture(props) {
  return createElement(
    InkAppearanceScope.Provider,
    { value: { pageId: 'blank', theme: 'light' } },
    createElement(RasterInk, { color: 'Blue', ...props })
  );
}
async function render(strokes, prepareEraser = false, draft = null) {
  await act(async () =>
    root.render(
      rasterFixture({
        ref,
        strokes,
        drafts: draft ? [draft] : [],
        brush: typeof prepareEraser === 'string' ? prepareEraser : prepareEraser ? 'eraser' : 'pen',
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
  it('provides the real blank paper appearance to live and fixed capture scenes', async () => {
    await render([crayon, magic], true);
    await frames();
    expect(state.captures).toHaveLength(1);
    const scenes = [...host.querySelectorAll('[data-appearance]')];
    expect(scenes.length).toBeGreaterThan(1);
    expect(new Set(scenes.map((scene) => scene.dataset.appearance))).toEqual(
      new Set(['blank:light'])
    );
    expect(error).not.toHaveBeenCalled();
  });

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
    expect(ref.current.readyPlan([marker, magic]).checkpoint).toBeNull();
    expect(ref.current.canStart([marker, magic], 'eraser', false)).toBe(true);
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
    expect(ref.current.readyPlan([marker]).checkpoint).toBeNull();
    expect(ref.current.canStart([marker], 'eraser', false)).toBe(true);
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

describe('visible replay and Android cached image readiness', () => {
  it('presents the complete chronological scene while rebuilding history and Undo prefixes', async () => {
    const history = [crayon, erase, marker, erase];
    await render(history);
    expect(host.querySelector('[data-svg-width="100%"] [data-opacity="1"]')).not.toBeNull();
    await frames();
    expect(state.captures[0].children.props.strokes).toEqual([crayon]);
    await png(0, 'first');
    expect(host.querySelector('[data-svg-width="100%"] [data-opacity="1"]')).not.toBeNull();
    await load();
    await load('1024');
    await frames();
    await png(1, 'second');
    await load();
    expect(ref.current.isReady()).toBe(true);
    await render(history.slice(0, 2));
    expect(host.querySelector('[data-svg-width="100%"] [data-opacity="1"]')).not.toBeNull();
    await frames();
    expect(state.captures[2].children.props.strokes).toEqual([crayon]);
    await png(2, 'undo-prefix');
    await load();
    expect(ref.current.isReady()).toBe(true);
    expect(host.querySelector('[data-opacity="1"] [data-strokes]').dataset.strokes).toBe('eraser');
  });
  it('promotes a cache-hit PNG from the decoded RN callback without an SVG load event', async () => {
    state.platform.OS = 'android';
    await render([crayon, erase]);
    await frames();
    await png(0, 'cached-native-prefix');
    const image = state.nativeImages.findLast((image) => image.resizeMethod === 'none');
    expect(image.resizeMethod).toBe('none');
    await load();
    expect(ref.current.isReady()).toBe(false);
    await act(async () =>
      image.onLoad({ nativeEvent: { source: { uri: image.source.uri, width: 1024, height: 768 } } })
    );
    expect(ref.current.isReady()).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });
  it('keeps decode failures terminal and refuses later readiness from the same image', async () => {
    state.platform.OS = 'android';
    await render([crayon, erase]);
    await frames();
    await png(0);
    const image = state.nativeImages.findLast((image) => image.resizeMethod === 'none');
    await act(async () => image.onError({ nativeEvent: { error: 'decode failed' } }));
    await act(async () =>
      image.onLoad({ nativeEvent: { source: { uri: image.source.uri, width: 1024, height: 768 } } })
    );
    expect(error).toHaveBeenCalledOnce();
    expect(ref.current.isReady()).toBe(false);
    await frames();
    expect(state.captures).toHaveLength(1);
  });
});

it('refuses an Android SVG-first callback when the decoded witness is missing or has the wrong grid', async () => {
  state.platform.OS = 'android';
  await render([crayon, erase]);
  await frames();
  await png(0);
  await load();
  expect(ref.current.isReady()).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(PNG_TIMEOUT_MS));
  expect(error).toHaveBeenCalledOnce();
  expect(error.mock.calls[0][0].message).toContain('did not load');
  expect(ref.current.isReady()).toBe(false);
});
it('keeps a wrong-grid decoded callback terminal after SVG loads first', async () => {
  state.platform.OS = 'android';
  await render([crayon, erase]);
  await frames();
  await png(0);
  await load();
  const image = state.nativeImages.findLast((image) => image.resizeMethod === 'none');
  await act(async () =>
    image.onLoad({ nativeEvent: { source: { uri: image.source.uri, width: 1023, height: 768 } } })
  );
  expect(error).toHaveBeenCalledOnce();
  expect(error.mock.calls[0][0].message).toContain('unexpected image or sampling grid');
  expect(ref.current.isReady()).toBe(false);
});

describe('provisional selection versus canonical committed pixels', () => {
  it('exports the canonical plan after selection alone and discards preparation on a mode excursion', async () => {
    const prefix = [marker];
    await render(prefix, 'crayon');
    await frames();
    await png(0, 'unused-selection');
    await load();
    expect(ref.current.canStart(prefix, 'crayon', false)).toBe(true);
    expect(ref.current.canStart(prefix, 'eraser', false)).toBe(false);
    expect(ref.current.readyPlan(prefix).checkpoint).toBeNull();
    expect(ref.current.readyPlan(prefix).strokes).toEqual(prefix);
    await render(prefix, 'pen');
    const extended = [...prefix, { ...marker, color: 'Red' }];
    await render(extended, 'pen');
    expect(ref.current.readyPlan(extended).checkpoint).toBeNull();
    expect(state.captures).toHaveLength(1);
    await render(extended, 'crayon');
    await frames();
    expect(state.captures).toHaveLength(2);
    expect(state.captures[1].children.props.strokes).toEqual(extended);
    expect(state.captures[1].children.props.checkpoint).toBeNull();
  });

  it('never promotes a decoded through-Crayon cache after an unconsumed eraser excursion', async () => {
    await render([crayon], 'eraser');
    await frames();
    await png(0, 'unused-through-crayon');
    await load();
    await render([crayon], 'crayon');
    const strokes = [crayon, { ...crayon, seed: 18 }];
    await render(strokes, 'crayon');
    expect(ref.current.readyPlan(strokes).checkpoint).toBeNull();
    expect(ref.current.readyPlan(strokes).strokes).toEqual(strokes);
    expect(state.captures).toHaveLength(1);
  });

  it('uses preparation for the actual cohort, promotes only on commit, and invalidates witness-removing Undo', async () => {
    const prefix = [marker];
    await render(prefix, 'crayon');
    await frames();
    await png(0, 'canonical-marker-prefix');
    await load();
    await render(prefix, 'crayon', crayon);
    expect(host.querySelector('[data-opacity="1"] [data-strokes="crayon"]')).not.toBeNull();
    expect(() => ref.current.readyPlan(prefix)).toThrow('still being prepared');
    await frames();
    expect(state.captures).toHaveLength(1);
    const committed = [...prefix, crayon];
    await render(committed, 'crayon');
    expect(ref.current.readyPlan(committed).checkpoint.base64).toBe('canonical-marker-prefix');
    expect(ref.current.readyPlan(committed).strokes).toEqual([crayon]);
    await render(prefix, 'pen');
    expect(ref.current.readyPlan(prefix).checkpoint).toBeNull();
    expect(ref.current.readyPlan(prefix).strokes).toEqual(prefix);
    await render(prefix, 'crayon');
    expect(ref.current.canStart(prefix, 'crayon', false)).toBe(false);
    await frames();
    expect(state.captures).toHaveLength(2);
    expect(state.captures[1].children.props.checkpoint).toBeNull();
    await png(1, 'rebuilt-marker-prefix');
    await load();
    const reentered = [...prefix, { ...crayon, seed: 19 }];
    await render(reentered, 'crayon');
    expect(ref.current.readyPlan(reentered).checkpoint.base64).toBe('rebuilt-marker-prefix');
    expect(ref.current.readyPlan(reentered).strokes).toEqual([reentered[1]]);
  });

  it('refuses a late decoded selection image after a mode-only excursion', async () => {
    await render([marker], 'crayon');
    await frames();
    await png(0, 'late-selection');
    const late = state.imageLoads.at(-1).onImageLoad;
    await render([marker], 'pen');
    await act(async () => late());
    expect(ref.current.readyPlan([marker]).checkpoint).toBeNull();
    expect(ref.current.canStart([marker], 'pen', false)).toBe(true);
    await render([marker], 'crayon');
    expect(ref.current.canStart([marker], 'crayon', false)).toBe(false);
    await frames();
    expect(state.captures).toHaveLength(2);
  });

  it('keeps full mixed drafts visible and never captures them as a checkpoint', async () => {
    const drafts = [marker, erase, { ...marker, color: 'Red' }, { ...erase, width: 80 }];
    await act(async () =>
      root.render(
        rasterFixture({
          ref,
          strokes: [],
          drafts,
          brush: 'eraser',
          onError: error,
          onBusy: busy,
        })
      )
    );
    await frames();
    expect(state.captures).toHaveLength(0);
    expect(
      host.querySelector('[data-opacity="1"] [data-strokes="pen,eraser,pen,eraser"]')
    ).not.toBeNull();
    expect(ref.current.canStart([], 'crayon', true)).toBe(true);
    expect(() => ref.current.readyPlan(drafts)).toThrow('still being prepared');
  });
});

it.each(['native', 'svg'])(
  'holds selected Crayon readiness until the %s texture decoder completes',
  async (decoder) => {
    if (decoder === 'native') state.autoNativeTiles = false;
    else state.autoSvgTiles = false;
    await render([], 'crayon');
    expect(ref.current.isReady()).toBe(false);
    expect(ref.current.canStart([], 'crayon', false)).toBe(false);
    expect(() => ref.current.readyPlan([])).toThrow('still being prepared');
    await act(async () => {
      if (decoder === 'native') {
        for (const image of state.nativeImages.filter(
          (image) => image.style?.width === CRAYON_TILE_PX
        ))
          image.onLoad({
            nativeEvent: {
              source: {
                uri: image.source.uri,
                width: CRAYON_TILE_PX,
                height: CRAYON_TILE_PX,
              },
            },
          });
      } else for (const image of state.svgTiles) image.onLoad();
    });
    expect(ref.current.isReady()).toBe(true);
    expect(ref.current.canStart([], 'crayon', false)).toBe(true);
    expect(error).not.toHaveBeenCalled();
  }
);
