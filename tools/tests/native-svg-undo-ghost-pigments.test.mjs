// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing, LEGACY_PAPER } from './native-paper-fixtures.mjs';
import { paperProjection } from '../../src/drawing/paperSpace.ts';
import { SvgUndoGhostLayer, useSvgUndoGhostPlan } from '../../src/drawing/SvgUndoGhost.tsx';
import * as tileOwner from '../../src/drawing/useCrayonTileReadiness.tsx';
import { planInk } from '../../src/drawing/checkpoints.ts';
import { CRAYON_BANDS } from '../../src/drawing/crayon.ts';
import { InkAppearanceScope } from '../../src/drawing/InkAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../src/drawing/useReduceMotion.ts';
import { emptyDrawing, strokeStyle } from '../../src/drawing/model.ts';

// The SVG Undo ghost's crayon pigments: which tile resources each plan and the ghost layer own.
const PLANE = { width: 400, height: 300 };
const skia = vi.hoisted(() => ({
  loadImages: true,
  imageLoads: 0,
  plane: { width: 400, height: 300 },
}));

vi.mock('react-native', async () => {
  const { nativeInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeInkViewSdk(() => skia.plane, loadImage);
});

vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk(loadImage);
});

function loadImage(onLoad) {
  if (skia.loadImages) {
    skia.imageLoads += 1;
    onLoad?.();
  }
}

let container;
let root;
const paper = adoptedDrawing({ ...PLANE, pixelRatio: 1 }).paper;
const pen = (points) => ({ ...strokeStyle('pen', 'Green', emptyDrawing()), points });

function feedbackFor(before, after, onFinished = vi.fn()) {
  return { id: 1, before, after, reduced: false, startedAt: 0, towards: null, onFinished };
}

function drawingAppearance(child) {
  return createElement(
    ReduceMotionPreferenceProvider,
    { preference: 'full' },
    createElement(
      InkAppearanceScope.Provider,
      { value: { pageId: 'blank', theme: 'light' } },
      child
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // The ghost's motion starts at time 0 and stays mid-flight: no frame is ever painted.
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  skia.loadImages = true;
  skia.imageLoads = 0;
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

it.each(
  ['none', 'prefix', 'exact-after', 'wrong-paper', 'wrong-prefix'].flatMap((kind) =>
    ['crayon', 'pen'].map((brush) => [kind, brush])
  )
)('owns the SVG ghost pigments with a %s checkpoint and %s removal', async (kind, brush) => {
  const raster = brush === 'crayon';
  skia.loadImages = raster;
  const prefix = Array.from({ length: 17 }, (_, index) => ({
    brush: 'crayon',
    width: 34,
    seed: index + 1,
    color: `#${(index + 1).toString(16).padStart(6, '0').toUpperCase()}`,
    points: [{ x: 40, y: 40 }],
  }));
  const separator = pen([{ x: 20, y: 20 }]);
  const green = { ...prefix[0], color: 'Green' };
  const red = { ...prefix[0], color: 'Red' };
  const tailPen = pen([{ x: 50, y: 50 }]);
  const survivors = [...prefix, separator, green];
  const after = { version: 5, pageId: 'blank', rainbow: 0, strokes: survivors };
  const removed = raster ? [tailPen, red] : [tailPen];
  const before = { ...after, strokes: [...after.strokes, ...removed] };
  const checkpoint = {
    id: 1,
    base64: 'checkpoint',
    paper: kind === 'wrong-paper' ? paper : LEGACY_PAPER,
    projection: paperProjection(kind === 'wrong-paper' ? paper : LEGACY_PAPER),
    strokes: kind === 'exact-after' ? after.strokes : [...prefix, separator],
  };
  const cached = kind === 'none' ? null : checkpoint;
  if (kind === 'wrong-prefix') cached.strokes = [{ ...prefix[0] }, ...cached.strokes.slice(1)];
  const valid = kind === 'prefix' || kind === 'exact-after';
  const beforeTail =
    kind === 'exact-after' ? removed : valid ? [green, ...removed] : before.strokes;
  const afterTail = kind === 'exact-after' ? [] : valid ? [green] : after.strokes;
  const display = after.strokes.slice(valid ? cached.strokes.length : 0);
  const feedback = feedbackFor(before, after);
  const requests = vi.spyOn(tileOwner, 'useCrayonTileResources');
  let current;
  function RasterPlan({ cue }) {
    current.ghost = useSvgUndoGhostPlan(cue, cached).ghost;
    return null;
  }
  function Owner({ cue }) {
    const resources = tileOwner.useCrayonTileResources(display, 'light');
    current = { resources };
    return createElement(
      tileOwner.CrayonTileResourceScope.Provider,
      { value: resources },
      raster && createElement(RasterPlan, { cue }),
      cue &&
        createElement(SvgUndoGhostLayer, {
          feedback: cue,
          checkpoint: cached,
          frame: { ...PLANE, pageX: 0, pageY: 0 },
        })
    );
  }
  const renderOwner = (cue) => drawingAppearance(createElement(Owner, { cue }));
  await act(async () => root.render(renderOwner(feedback)));
  const pigmentCount = (strokes) =>
    new Set(strokes.filter((stroke) => stroke.brush === 'crayon').map((stroke) => stroke.color))
      .size;
  expect(current.resources.byKey.size).toBe(pigmentCount(display) * CRAYON_BANDS.length);
  expect(skia.imageLoads === 0).toBe(!raster);
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).not.toBeNull();
  expect(current.ghost?.plan?.strokes).toEqual(raster ? beforeTail : undefined);
  expect(current.ghost?.remaining?.strokes).toEqual(raster ? afterTail : undefined);
  expect(current.ghost?.plan?.checkpoint).toBe(raster ? (valid ? cached : null) : undefined);
  expect(current.ghost?.remaining?.checkpoint).toBe(raster ? (valid ? cached : null) : undefined);
  expect(
    planInk(before.strokes, cached, LEGACY_PAPER, paperProjection(LEGACY_PAPER)).needsCheckpoint
  ).toBe(raster || kind !== 'prefix');
  const consumers = requests.mock.calls.map(([strokes], index) => ({
    strokes,
    count: requests.mock.results[index].value.byKey.size,
  }));
  expect(consumers).toEqual(
    expect.arrayContaining(
      raster
        ? [
            { strokes: beforeTail, count: pigmentCount(beforeTail) * CRAYON_BANDS.length },
            { strokes: afterTail, count: pigmentCount(afterTail) * CRAYON_BANDS.length },
          ]
        : [
            { strokes: [], count: 0 },
            { strokes: removed, count: 0 },
          ]
    )
  );
  expect(
    consumers.every(({ strokes, count }) => raster || strokes === display || count === 0)
  ).toBe(true);
  await act(async () => root.render(renderOwner(null)));
  expect(current.ghost ?? null).toBeNull();
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
  expect(current.resources.byKey.size).toBe(pigmentCount(display) * CRAYON_BANDS.length);
  requests.mockRestore();
});
