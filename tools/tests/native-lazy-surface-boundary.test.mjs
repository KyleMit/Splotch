// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lazySurface } from '../../experiments/native-architecture/src/rsdDrawing/lazySurface.ts';
import {
  RsdSurfaceBoundary,
  SURFACE_FAILURE_LABEL,
  SURFACE_FAILURE_MESSAGE,
} from '../../experiments/native-architecture/src/rsdDrawing/RsdSurfaceBoundary.tsx';
import { RsdSurfaceFailure as WebSurfaceFailure } from '../../experiments/native-architecture/src/rsdDrawing/RsdSurfaceFailure.web.tsx';

vi.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 390, height: 844 }) }));
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
    ['div', 'span'].map((tag) => [tag, ({ style: _style, ...props }) => createElement(tag, props)])
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
