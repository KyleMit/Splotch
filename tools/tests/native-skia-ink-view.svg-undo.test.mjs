// @vitest-environment happy-dom
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { useUndoAction } from '../../experiments/native-architecture/src/useUndoAction.ts';
import {
  DrawingSessionProvider,
  useDrawingHistory,
} from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import {
  SvgUndoGhostLayer,
  useSvgUndoGhostPlan,
} from '../../experiments/native-architecture/src/drawing/SvgUndoGhost.tsx';
import { InkPaperScope } from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import { paperProjection } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

const PLANE = { width: 400, height: 300 };
const state = vi.hoisted(() => ({ frames: new Map(), nextFrame: 0 }));
vi.mock('react-native', async () => {
  const { nativeInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeInkViewSdk(() => PLANE, loadImage);
});
vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk(loadImage);
});
function loadImage(onLoad) {
  onLoad?.();
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
let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  state.frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++state.nextFrame;
    state.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => state.frames.delete(id));
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

it('reprojects the mounted SVG Undo owner with the same feedback without reusing its old raster', async () => {
  const basis = adoptedDrawing({ width: 400, height: 800, pixelRatio: 1 }).paper;
  const original = paperProjection(basis);
  const resized = paperProjection(basis, { width: 800, height: 1000 });
  const survivor = {
    brush: 'crayon',
    width: 34,
    seed: 1,
    color: 'Green',
    points: [{ x: 40, y: 40 }],
  };
  const removed = { ...survivor, seed: 2, color: 'Red', points: [{ x: 70, y: 70 }] };
  const before = {
    version: 7,
    paper: basis,
    pageId: 'blank',
    rainbow: 0,
    strokes: [survivor, removed],
  };
  const after = { ...before, strokes: [survivor] };
  const checkpoint = {
    id: 1,
    paper: basis,
    projection: original,
    strokes: after.strokes,
    base64: 'prior-extent',
  };
  let commands;
  let historyOwner;
  let ghost;
  function Owner() {
    historyOwner = useDrawingHistory();
    const { historyRef, setHistory } = historyOwner;
    const surface = useRef({ lockInput: () => () => {} });
    const command = useRef(false);
    commands = useUndoAction({
      historyRef,
      setHistory,
      surface,
      command,
      blocked: () => false,
      inputActive: () => false,
      setNotice: () => {},
      report: (error) => {
        throw error;
      },
    });
    ghost = useSvgUndoGhostPlan(commands.undoGhost, checkpoint).ghost;
    return commands.undoGhost
      ? createElement(SvgUndoGhostLayer, {
          feedback: commands.undoGhost,
          checkpoint,
          frame: { ...PLANE, pageX: 0, pageY: 0 },
        })
      : null;
  }
  const show = (projection) =>
    createElement(
      DrawingSessionProvider,
      null,
      drawingAppearance(
        createElement(InkPaperScope.Provider, { value: projection }, createElement(Owner))
      )
    );
  await act(async () => root.render(show(original)));
  await act(async () => historyOwner.setHistory({ drawing: before, undo: [after] }));
  await act(async () => commands.undo(false, null));
  const feedback = commands.undoGhost;
  const history = historyOwner.history;
  const prior = ghost;
  expect(feedback).not.toBeNull();
  expect(history.drawing).toBe(after);
  expect(prior.plan.checkpoint).toBe(checkpoint);
  expect(prior.remaining.checkpoint).toBe(checkpoint);
  expect(
    container.querySelector('[data-ghost-image="data:image/png;base64,prior-extent"]')
  ).not.toBeNull();
  await act(async () => root.render(show(resized)));
  expect(commands.undoGhost).toBe(feedback);
  expect(historyOwner.history).toBe(history);
  expect(ghost).not.toBe(prior);
  expect(ghost.plan.projection).toBe(resized);
  expect(ghost.remaining.projection).toBe(resized);
  expect(ghost.plan.checkpoint).toBeNull();
  expect(ghost.remaining.checkpoint).toBeNull();
  expect(ghost.plan.prefix).toBe(before.strokes);
  expect(ghost.remaining.prefix).toBe(after.strokes);
  expect(ghost.plan.strokes[0]).toBe(survivor);
  expect(ghost.plan.strokes[1]).toBe(removed);
  expect(ghost.remaining.strokes[0]).toBe(survivor);
  expect(before.strokes[0].points).toBe(survivor.points);
  expect(before.strokes[1].points).toBe(removed.points);
  expect(
    container.querySelector('[data-ghost-image="data:image/png;base64,prior-extent"]')
  ).toBeNull();
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).not.toBeNull();
  const current = ghost;
  await act(async () => root.render(show(paperProjection(basis, resized.extent))));
  expect(commands.undoGhost).toBe(feedback);
  expect(ghost).toBe(current);
});
