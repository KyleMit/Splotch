// @vitest-environment happy-dom
import { act, createElement, StrictMode, useEffect, useRef, useState } from 'react';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { useUndoAction } from '../../experiments/native-architecture/src/useUndoAction.ts';
import { addStroke, strokeStyle } from '../../experiments/native-architecture/src/drawing/model.ts';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { STEP_NUMBER_SIZE_PX } from '../../experiments/native-architecture/src/rsdDrawing/stepNumberSize.ts';
import { lazySurface } from '../../experiments/native-architecture/src/rsdDrawing/lazySurface.ts';
import { deferredLayer } from '../../experiments/native-architecture/src/rsdDrawing/clearSurfaces.web.ts';
import {
  RsdSurfaceBoundary,
  SURFACE_FAILURE_LABEL,
  SURFACE_FAILURE_MESSAGE,
} from '../../experiments/native-architecture/src/rsdDrawing/RsdSurfaceBoundary.tsx';
import { RsdSurfaceFailure as WebSurfaceFailure } from '../../experiments/native-architecture/src/rsdDrawing/RsdSurfaceFailure.web.tsx';

vi.mock('react-native', async () => ({
  ...(await import('react-native-web')),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx', () => ({
  useDrawingAppearance: () => 'light',
}));
vi.mock('../../experiments/native-architecture/src/platform/BrowserBack.tsx', () => ({
  useDialogBack: () => {},
}));
vi.mock('../../experiments/native-architecture/src/platform/reducedTransparency.web.ts', () => ({
  useReducedTransparency: () => false,
}));
vi.mock('../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts', () => ({
  colors: {},
  darkTheme: {},
  dimensions: {},
  fonts: {},
  shadows: {},
}));

const background = vi.hoisted(() => ({ painted: false, waiters: [], idle: [] }));
vi.mock('../../experiments/native-architecture/src/product/drawingPaint.ts', () => ({
  drawingPaint: {
    painted: () =>
      background.painted
        ? Promise.resolve()
        : new Promise((resolve) => background.waiters.push(resolve)),
  },
}));
vi.mock('../../web/src/lib/idle.ts', () => ({
  scheduleInteractionIdle: (run) => {
    background.idle.push(run);
    return () => {};
  },
}));

vi.mock('react-strict-dom', () => ({
  css: { create: (styles) => styles },
  html: Object.fromEntries(
    ['div', 'span'].map((tag) => [
      tag,
      ({ style, ...props }) => {
        const merged = Object.assign({}, ...[style].flat(3).filter(Boolean));
        const layout = Object.fromEntries(
          ['width', 'height', 'flexShrink'].map((key) => [key, merged[key]])
        );
        return createElement(tag, { ...props, style: layout });
      },
    ])
  ),
}));
vi.mock('../../experiments/native-architecture/src/rsdDrawing/controls.tsx', () => ({
  styles: {},
  RsdAction: ({ label, onClick }) =>
    createElement('button', { 'aria-label': label, onClick }, label),
}));
// The frame as the boundary drives it: shown while visible, reporting its dismissal once hidden.
vi.mock('../../experiments/native-architecture/src/rsdDrawing/ModalShell.tsx', () => ({
  ModalShell: function ModalShell({ visible, label, header, children, onDismiss }) {
    useEffect(() => {
      if (!visible) onDismiss?.();
    }, [visible, onDismiss]);
    return visible
      ? createElement('section', { role: 'dialog', 'aria-label': label }, header, children)
      : null;
  },
}));
vi.mock('../../experiments/native-architecture/src/rsdDrawing/DialogHeader.tsx', () => ({
  DialogHeader: ({ title, onClose }) =>
    createElement(
      'header',
      null,
      createElement('h2', null, title),
      createElement('button', { 'aria-label': 'Close', onClick: onClose })
    ),
}));

const CHUNK_FAILURE = new Error(
  'Loading module /_expo/static/js/web/RsdSettingsDialog-1.js failed.'
);
let host, root, errors;
beforeEach(() => {
  background.painted = false;
  background.waiters.length = 0;
  background.idle.length = 0;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.doUnmock('../../experiments/native-architecture/src/lazyExport.ts');
  vi.doUnmock('../../experiments/native-architecture/src/rsdDrawing/undoFeedbackChunk.web.ts');
});

function Settings({ notice }) {
  return createElement('section', { role: 'dialog', 'aria-label': 'Drawing settings' }, notice);
}

// The drawing screen as RsdDrawingScreen composes it: the paper always, and an on-request
// surface inside its own boundary.
function screen(Surface, onClose, onDismiss) {
  return createElement(
    'main',
    null,
    createElement('div', { 'data-testid': 'paper' }, 'drawing'),
    createElement(
      RsdSurfaceBoundary,
      { onClose, onDismiss },
      createElement(Surface, { notice: 'Settings' })
    )
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const dialog = (label) => host.querySelector(`[role="dialog"][aria-label="${label}"]`);
const button = (label) => host.querySelector(`button[aria-label="${label}"]`);

it('prewarms one surface per quiet slice after drawing paints and renders it on its first open', async () => {
  const first = vi.fn(async () => Settings);
  const second = vi.fn(async () => Settings);
  const Surface = lazySurface(first);
  lazySurface(second);
  await settle();
  expect(first).not.toHaveBeenCalled();
  expect(background.idle).toHaveLength(0);
  background.painted = true;
  for (const ready of background.waiters) ready();
  await settle();
  expect(background.idle).toHaveLength(1);
  background.idle.shift()();
  await settle();
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  expect(background.idle).toHaveLength(1);
  background.idle.shift()();
  await settle();
  expect(second).toHaveBeenCalledOnce();
  await act(async () => root.render(screen(Surface, vi.fn())));
  expect(dialog('Drawing settings')).not.toBeNull();
  expect(first).toHaveBeenCalledOnce();
});

it('keeps the drawing screen when a surface chunk fails, then loads it on Try again', async () => {
  const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILURE).mockResolvedValueOnce(Settings);
  const Surface = lazySurface(load);
  await act(async () => root.render(screen(Surface, vi.fn())));
  await settle();
  expect(host.querySelector('[data-testid="paper"]').textContent).toBe('drawing');
  expect(dialog(SURFACE_FAILURE_LABEL).textContent).toContain(SURFACE_FAILURE_MESSAGE);
  expect(dialog('Drawing settings')).toBeNull();
  await act(async () => button('Try again').click());
  await settle();
  expect(load).toHaveBeenCalledTimes(2);
  expect(dialog(SURFACE_FAILURE_LABEL)).toBeNull();
  expect(dialog('Drawing settings').textContent).toBe('Settings');
  expect(host.querySelector('[data-testid="paper"]')).not.toBeNull();
});

it('closes a failed surface through its owner and leaves the drawing in place', async () => {
  const onClose = vi.fn();
  const onDismiss = vi.fn();
  const Surface = lazySurface(vi.fn().mockRejectedValue(CHUNK_FAILURE));
  await act(async () => root.render(screen(Surface, onClose, onDismiss)));
  await settle();
  expect(button('Keep drawing')).toBeNull();
  await act(async () => button('Close').click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();
  expect(dialog(SURFACE_FAILURE_LABEL)).toBeNull();
  expect(host.querySelector('[data-testid="paper"]').textContent).toBe('drawing');
});

it('forgets a failed load, so the next mount of the surface loads again', async () => {
  const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILURE).mockResolvedValueOnce(Settings);
  const Surface = lazySurface(load);
  await act(async () => root.render(screen(Surface, vi.fn())));
  await settle();
  await act(async () => root.render(createElement('main')));
  await act(async () => root.render(screen(Surface, vi.fn())));
  await settle();
  expect(load).toHaveBeenCalledTimes(2);
  expect(dialog('Drawing settings')).not.toBeNull();
});

it('loads a surface once and renders it at once on every later mount', async () => {
  const load = vi.fn().mockResolvedValue(Settings);
  const Surface = lazySurface(load);
  await act(async () => root.render(screen(Surface, vi.fn())));
  await settle();
  await act(async () => root.render(createElement('main')));
  await act(async () => root.render(screen(Surface, vi.fn())));
  expect(dialog('Drawing settings')).not.toBeNull();
  expect(load).toHaveBeenCalledOnce();
  expect(errors).not.toHaveBeenCalled();
});

it('keeps web failure recovery available without downloading a modal chunk', async () => {
  const onClose = vi.fn();
  const onDismiss = vi.fn();
  const onRetry = vi.fn();
  const props = {
    visible: true,
    label: SURFACE_FAILURE_LABEL,
    message: SURFACE_FAILURE_MESSAGE,
    onClose,
    onDismiss,
    onRetry,
  };
  await act(async () => root.render(createElement(WebSurfaceFailure, props)));
  const fallback = host.querySelector('dialog');
  expect(fallback.open).toBe(true);
  expect(fallback.textContent).toContain(SURFACE_FAILURE_MESSAGE);
  await act(async () => button('Try again').click());
  expect(onRetry).toHaveBeenCalledOnce();
  const cancel = new Event('cancel', { cancelable: true });
  await act(async () => fallback.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(createElement(WebSurfaceFailure, { ...props, visible: false }))
  );
  expect(fallback.open).toBe(false);
  expect(onDismiss).toHaveBeenCalledOnce();
});

it('keeps a camera glyph and its focused button through a decorative chunk failure and retry', async () => {
  const requests = [];
  const load = vi.fn(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  const Cue = deferredLayer(load, 'The screenshot capture cue', (props) => props.children);
  const save = vi.fn();
  const glyph = createElement('span', { 'data-testid': 'camera-glyph' }, 'camera');
  const render = (key) =>
    createElement(
      'button',
      { 'aria-label': 'Save screenshot', onClick: save },
      createElement(Cue, { key }, glyph)
    );
  await act(async () => root.render(render('first')));
  const button = host.querySelector('[aria-label="Save screenshot"]');
  expect(host.querySelector('[data-testid="camera-glyph"]')).not.toBeNull();
  button.focus();
  await act(async () => button.click());
  expect(save).toHaveBeenCalledOnce();
  await act(async () => requests[0].reject(CHUNK_FAILURE));
  expect(host.querySelector('[data-testid="camera-glyph"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Save screenshot"]')).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(errors).toHaveBeenCalledWith('The screenshot capture cue failed to load:', CHUNK_FAILURE);
  await act(async () => root.render(render('retry')));
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () =>
    requests[1].resolve(({ children }) =>
      createElement('span', { 'data-capture-cue': true }, children)
    )
  );
  expect(host.querySelector('[data-capture-cue]')).not.toBeNull();
  expect(host.querySelector('[data-testid="camera-glyph"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Save screenshot"]')).toBe(button);
  expect(document.activeElement).toBe(button);
});

it('plays the remaining first shutter cue when its real web component mounts from a delayed chunk', async () => {
  const { Animated } = await import('react-native');
  const { RsdCameraFeedback } =
    await import('../../experiments/native-architecture/src/rsdDrawing/RsdCameraFeedback.tsx');
  const { CAMERA_CAPTURE_MS } =
    await import('../../experiments/native-architecture/src/rsdDrawing/cameraKeyframes.ts');
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const timing = vi.spyOn(Animated, 'timing').mockReturnValue({ start() {}, stop() {} });
  let finish;
  const Cue = deferredLayer(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    'The screenshot capture cue',
    (props) => props.children
  );
  const feedback = { id: 1, kind: 'capture', startedAt: 0, reduced: false };
  const render = (key) =>
    createElement(Cue, { key, feedback }, createElement('span', null, 'camera'));
  await act(async () => root.render(render('first')));
  expect(host.textContent).toBe('camera');
  expect(timing).not.toHaveBeenCalled();
  clock.mockReturnValue(CAMERA_CAPTURE_MS / 2);
  await act(async () => finish(RsdCameraFeedback));
  expect(timing).toHaveBeenCalledOnce();
  expect(timing.mock.calls[0][1]).toMatchObject({
    duration: CAMERA_CAPTURE_MS / 2,
    useNativeDriver: true,
  });
  clock.mockReturnValue(CAMERA_CAPTURE_MS + 1);
  await act(async () => root.render(render('remounted')));
  expect(timing).toHaveBeenCalledOnce();
});

async function webStepNumber(load) {
  vi.resetModules();
  vi.doMock(
    '../../experiments/native-architecture/src/rsdDrawing/RsdStepNumberContent.tsx',
    () => ({
      RsdStepNumber: () => createElement('span', { 'data-loaded-badge': true }, '1'),
    })
  );
  vi.doMock('../../experiments/native-architecture/src/lazyExport.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      createLazyExport: (importContent) =>
        actual.createLazyExport(() => load().then(importContent)),
    };
  });
  return (
    await import('../../experiments/native-architecture/src/rsdDrawing/RsdStepNumber.web.tsx')
  ).RsdStepNumber;
}

function stepRows(Badge) {
  return createElement(
    RsdSurfaceBoundary,
    null,
    createElement(
      'section',
      { 'data-step-instructions': true },
      createElement('h2', null, 'Install as App'),
      ...Object.keys(STEP_NUMBER_SIZE_PX).map((size) =>
        createElement(
          'div',
          { key: size },
          createElement(Badge, { number: 1, size, shape: 'disc' }),
          createElement('span', null, 'Follow the prompts')
        )
      ),
      createElement('button', { 'aria-label': 'Close instructions' }, 'Close')
    )
  );
}

it('reserves every shipping badge size during the shared first-use import', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const load = vi.fn(() => pending);
  const Badge = await webStepNumber(load);
  await act(async () => root.render(stepRows(Badge)));
  const boxes = [...host.querySelectorAll('[aria-hidden="true"]')];
  expect(boxes).toHaveLength(Object.keys(STEP_NUMBER_SIZE_PX).length);
  expect(boxes.map((box) => [box.style.width, box.style.height, box.style.flexShrink])).toEqual(
    Object.values(STEP_NUMBER_SIZE_PX).map((size) => [`${size}px`, `${size}px`, '0'])
  );
  expect(load).toHaveBeenCalledOnce();
  await act(async () => finish({ RsdStepNumber: () => null }));
});

it('keeps instructions and Close mounted after a badge failure, then retries on remount', async () => {
  const load = vi.fn().mockRejectedValueOnce(CHUNK_FAILURE).mockResolvedValue(undefined);
  const Badge = await webStepNumber(load);
  await act(async () => root.render(stepRows(Badge)));
  expect(host.querySelector('[data-step-instructions]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Close instructions"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Did not load"]')).toBeNull();
  expect(errors).toHaveBeenCalledWith('The step number failed to load:', expect.any(Error));
  await act(async () => root.render(null));
  await act(async () => root.render(stepRows(Badge)));
  expect(load).toHaveBeenCalledTimes(2);
  expect(host.querySelectorAll('[data-loaded-badge]')).toHaveLength(
    Object.keys(STEP_NUMBER_SIZE_PX).length
  );
  expect(host.querySelector('[aria-label="Close instructions"]')).not.toBeNull();
  vi.doUnmock('../../experiments/native-architecture/src/rsdDrawing/RsdStepNumberContent.tsx');
  vi.doUnmock('../../experiments/native-architecture/src/lazyExport.ts');
});

async function webUndoGhost(load) {
  vi.resetModules();
  vi.doMock(
    '../../experiments/native-architecture/src/rsdDrawing/undoFeedbackChunk.web.ts',
    () => ({
      RsdUndoFeedback: ({ children }) => children,
      SvgUndoGhostLayer: ({ feedback, checkpoint }) =>
        createElement('div', {
          'data-ghost-id': feedback.id,
          'data-checkpoint-id': checkpoint.id,
        }),
    })
  );
  vi.doMock('../../experiments/native-architecture/src/lazyExport.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      createLazyExport: (importCue) => actual.createLazyExport(() => load().then(importCue)),
    };
  });
  return (
    await import('../../experiments/native-architecture/src/rsdDrawing/undoFeedbackSurface.web.ts')
  ).SvgUndoGhostLayer;
}

function undoOwner(Ghost, expose) {
  const blank = adoptedDrawing({ width: 400, height: 300, pixelRatio: 1 });
  const stroke = { ...strokeStyle('pen', 'Green', blank), points: [{ x: 30, y: 30 }] };
  const initial = addStroke(addStroke({ drawing: blank, undo: [] }, stroke), {
    ...stroke,
    points: [{ x: 60, y: 60 }],
  });
  return function Owner() {
    const [history, setHistory] = useState(initial);
    const historyRef = useRef(history);
    historyRef.current = history;
    const command = useRef(false);
    const surface = useRef({ lockInput: () => () => {} });
    const actions = useUndoAction({
      historyRef,
      setHistory,
      command,
      surface,
      blocked: () => false,
      inputActive: () => false,
      setNotice: () => {},
      report: (error) => {
        throw error;
      },
    });
    expose({ history, ...actions });
    return actions.undoGhost
      ? createElement(Ghost, {
          key: actions.undoGhost.id,
          feedback: actions.undoGhost,
          checkpoint: { id: actions.undoGhost.id },
          frame: null,
        })
      : null;
  };
}

it('expires a held Undo transport through its real StrictMode owner before the chunk resolves', async () => {
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const requests = [];
  const Ghost = await webUndoGhost(
    () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  );
  let owner;
  const Owner = undoOwner(Ghost, (value) => {
    owner = value;
  });
  await act(async () => root.render(createElement(StrictMode, null, createElement(Owner))));
  await act(async () => owner.undo(false, null));
  const first = owner.undoGhost;
  expect(first).not.toBeNull();
  expect(requests).toHaveLength(1);
  clock.mockReturnValue(420);
  await act(async () => vi.advanceTimersByTime(420));
  expect(owner.undoGhost).toBeNull();
  expect(owner.history.drawing.strokes).toHaveLength(1);
  await act(async () => requests[0].resolve());
  expect(host.querySelector('[data-ghost-id]')).toBeNull();
  clock.mockReturnValue(421);
  await act(async () => owner.undo(false, null));
  expect(owner.undoGhost.id).toBe(2);
  expect(host.querySelector('[data-ghost-id="2"]')).not.toBeNull();
  await act(async () => first.onFinished());
  expect(owner.undoGhost.id).toBe(2);
});

it('retries the shared Undo transport on the next accepted action after its first failure', async () => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const requests = [];
  const Ghost = await webUndoGhost(
    () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  );
  let owner;
  const Owner = undoOwner(Ghost, (value) => {
    owner = value;
  });
  await act(async () => root.render(createElement(Owner)));
  await act(async () => owner.undo(false, null));
  await act(async () => requests[0].reject(CHUNK_FAILURE));
  expect(owner.undoGhost).toBeNull();
  expect(host.querySelector('[data-ghost-id]')).toBeNull();
  await act(async () => owner.undo(false, null));
  expect(requests).toHaveLength(2);
  expect(owner.history.drawing.strokes).toHaveLength(0);
  await act(async () => requests[1].resolve());
  expect(host.querySelector('[data-ghost-id="2"]')).not.toBeNull();
  expect(owner.undoGhost.id).toBe(2);
});
