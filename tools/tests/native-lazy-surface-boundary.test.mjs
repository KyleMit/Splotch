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

vi.mock('react-strict-dom', () => ({
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
function screen(Surface, onClose) {
  return createElement(
    'main',
    null,
    createElement('div', { 'data-testid': 'paper' }, 'drawing'),
    createElement(RsdSurfaceBoundary, { onClose }, createElement(Surface, { notice: 'Settings' }))
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const dialog = (label) => host.querySelector(`[role="dialog"][aria-label="${label}"]`);
const button = (label) => host.querySelector(`button[aria-label="${label}"]`);

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
  const Surface = lazySurface(vi.fn().mockRejectedValue(CHUNK_FAILURE));
  await act(async () => root.render(screen(Surface, onClose)));
  await settle();
  expect(button('Keep drawing')).toBeNull();
  await act(async () => button('Close').click());
  expect(onClose).toHaveBeenCalledOnce();
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
