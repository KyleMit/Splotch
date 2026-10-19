// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import * as tileOwner from '../../experiments/native-architecture/src/drawing/useCrayonTileReadiness.tsx';
import { CRAYON_BANDS } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { SkiaInk } from '../../experiments/native-architecture/src/drawing/SkiaInk.tsx';
import { createLiveInkFeed } from '../../experiments/native-architecture/src/drawing/liveInk.ts';
import { InkPaperScope } from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import {
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const PLANE = { width: 400, height: 300 };
const skia = vi.hoisted(() => ({ surfaces: 0 }));

vi.mock('react-native', async () => {
  const { nativeInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeInkViewSdk(
    () => PLANE,
    (onLoad) => onLoad?.()
  );
});
vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk((onLoad) => onLoad?.());
});
vi.mock('../../experiments/native-architecture/src/drawing/skiaUndoGhostImage.ts', () => ({
  makeSkiaUndoGhost: () => null,
}));
vi.mock('@shopify/react-native-skia', async () => {
  const { recordingSkiaModule } = await import('./native-skia-recording-fixture.mjs');
  return recordingSkiaModule({
    onSurface: () => {
      skia.surfaces += 1;
    },
  });
});

const paper = adoptedDrawing({ ...PLANE, pixelRatio: 1 }).paper;
const pen = (points) => ({ ...strokeStyle('pen', 'Green', emptyDrawing()), points });
const crayon = (color) => ({
  ...strokeStyle('crayon', color, emptyDrawing()),
  points: [
    { x: 1, y: 1 },
    { x: 9, y: 9 },
  ],
});
let container;
let root;
const live = createLiveInkFeed();

function draw(strokes, brush = 'pen', color = 'Green') {
  const ink = createElement(SkiaInk, {
    strokes,
    live,
    brush,
    color,
    paperFrame: { ...PLANE, pageX: 0, pageY: 0 },
    onBusy: () => {},
    onError: (error) => {
      throw error;
    },
  });
  act(() =>
    root.render(
      createElement(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: 'blank', theme: 'light' } },
          createElement(InkPaperScope.Provider, { value: paper }, ink)
        )
      )
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('SkiaViewApi', { setJsiProperty: () => {} });
  skia.surfaces = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The paint context holds the Crayon tiles, and the committed layer is built from it. Choosing a
// new pigment changes the tiles but none of the committed pixels, so the layer is kept: the
// painter decodes a live stroke's tile on demand. Negative control: keying the layer on the
// context's identity rebuilds it, a new raster, on every pigment choice.
it('keeps the committed layer when a new pigment is chosen, building tiles from history alone', () => {
  const requests = vi.spyOn(tileOwner, 'useCrayonTileResources');
  const history = [
    pen([
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]),
    crayon('Red'),
  ];
  draw(history);
  const built = skia.surfaces;
  expect(built).toBeGreaterThan(0);
  draw(history, 'crayon', 'Red');
  draw(history, 'crayon', 'Blue');
  expect(skia.surfaces).toBe(built);
  const last = requests.mock.results.at(-1).value;
  expect(last.byKey.size).toBe(2 * CRAYON_BANDS.length);
  for (const [strokes, , selected] of requests.mock.calls) {
    expect(strokes).toBe(history);
    expect(selected === undefined || selected === 'Red' || selected === 'Blue').toBe(true);
  }
});
