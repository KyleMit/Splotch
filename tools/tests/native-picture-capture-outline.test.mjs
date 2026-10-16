// @vitest-environment happy-dom
import { legacyDrawing } from './native-paper-fixtures.mjs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPngCapture } from '../../experiments/native-architecture/src/drawing/interactions.ts';
import { PictureCapture } from '../../experiments/native-architecture/src/drawing/PictureCapture.tsx';
import {
  drawingPaper,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';

// The web export loads a Farm page's line art on first use (bundledOutlines.web.ts), so picture
// output must wait for it rather than capture paper and ink without the outline.
const state = vi.hoisted(() => ({ outlineReady: false, listeners: new Set(), captures: [] }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles) => styles },
  View: ({ children }) => createElement('div', null, children),
}));
vi.mock('react-native-svg', () => ({ Image: () => null, Rect: () => null }));
vi.mock('../../experiments/native-architecture/src/drawing/CaptureSvg.tsx', () => ({
  CaptureSvg: ({ children }) => createElement('div', null, children),
}));
vi.mock('../../experiments/native-architecture/src/drawing/FixedInkCapture.tsx', async () => {
  const { useEffect } = await import('react');
  return {
    FixedInkCapture: ({ onReady }) => {
      useEffect(() => onReady(), [onReady]);
      return null;
    },
  };
});
vi.mock('../../experiments/native-architecture/src/drawing/DecodedPng.tsx', () => ({
  DecodedPng: ({ onLoad }) => createElement('button', { 'data-decoded': '', onClick: onLoad }),
}));
vi.mock('../../experiments/native-architecture/src/drawing/svgCapture.ts', () => ({
  PNG_TIMEOUT_MS: 10_000,
  createSvgCapture: () => ({
    capture() {
      state.captures.push(state.captures.length === 0 ? 'ink' : 'picture');
      return { promise: Promise.resolve(state.captures.at(-1)), cancel() {} };
    },
    dispose() {},
  }),
}));
vi.mock('../../experiments/native-architecture/src/drawing/PageOutline.tsx', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  };
  return {
    PageOutline: () => null,
    usePageOutlineReady: () => useSyncExternalStore(subscribe, () => state.outlineReady),
  };
});

let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.outlineReady = false;
  state.captures.length = 0;
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

async function mountPictureCapture() {
  const drawing = legacyDrawing(0, 'farm/cat');
  const request = createPngCapture().begin(drawing, () => true);
  vi.spyOn(request, 'complete');
  const packet = {
    id: 1,
    request,
    kind: 'picture',
    pixelRatio: 1,
    plan: {
      paper: drawingPaper(drawing),
      projection: paperProjection(drawingPaper(drawing)),
      strokes: [],
      checkpoint: null,
    },
    appearance: { pageId: 'farm/cat', theme: 'light' },
    isCurrent: () => true,
  };
  await act(async () => root.render(createElement(PictureCapture, { packet })));
  return request;
}

it('captures the picture only after the page line art has loaded', async () => {
  const request = await mountPictureCapture();
  expect(state.captures).toEqual(['ink']);
  await act(async () => host.querySelector('[data-decoded]').click());
  expect(state.captures).toEqual(['ink']);
  expect(request.complete).not.toHaveBeenCalled();
  await act(async () => {
    state.outlineReady = true;
    for (const listener of state.listeners) listener();
  });
  expect(state.captures).toEqual(['ink', 'picture']);
  expect(request.complete).toHaveBeenCalledExactlyOnceWith('picture', { width: 1024, height: 768 });
});
