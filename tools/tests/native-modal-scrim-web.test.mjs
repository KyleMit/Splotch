// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ModalScrim } from '../../experiments/native-architecture/src/rsdDrawing/ModalScrim.web.tsx';
import {
  MODAL_SCRIM_BLUR_PX,
  MODAL_SCRIM_FROSTED,
  MODAL_SCRIM_PLAIN,
} from '../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';

let root;
let host;
let matching;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  matching = new Set();
  window.matchMedia = (query) => ({
    matches: matching.has(query),
    addEventListener() {},
    removeEventListener() {},
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

// The dialog motion's Animated.Value, reduced to the listener surface the scrim reads.
function fadeValue() {
  const listeners = new Map();
  return {
    addListener(listener) {
      const id = String(listeners.size);
      listeners.set(id, listener);
      return id;
    },
    removeListener(id) {
      listeners.delete(id);
    },
    emit(value) {
      for (const listener of listeners.values()) listener({ value });
    },
    listening: () => listeners.size,
  };
}

// Chromium keeps a fading ancestor as a backdrop-filter's backdrop root after the fade lands, so
// the frost must fade itself: the opacity belongs to the element carrying the filter.
it('fades the frosted element itself rather than a wrapper around it', async () => {
  const opacity = fadeValue();
  await act(async () =>
    root.render(createElement(ModalScrim, { opacity, touchBackdrop: 'frosted' }))
  );
  const scrim = host.querySelector('[data-testid="modal-scrim"]');
  expect(scrim.parentElement).toBe(host);
  expect(scrim.style.backdropFilter).toBe(`blur(${MODAL_SCRIM_BLUR_PX}px)`);
  expect(scrim.style.background).toBe(MODAL_SCRIM_FROSTED);
  expect(scrim.style.pointerEvents).toBe('none');
  expect(scrim.style.opacity).toBe('0');
  opacity.emit(0.5);
  expect(scrim.style.opacity).toBe('0.5');
  opacity.emit(1);
  expect(scrim.style.opacity).toBe('1');
  await act(async () => root.render(null));
  expect(opacity.listening()).toBe(0);
});

// app.css drops the Coloring Book Picker's backdrop blur on a coarse pointer only.
it.each([
  [true, MODAL_SCRIM_PLAIN, 'none'],
  [false, MODAL_SCRIM_FROSTED, `blur(${MODAL_SCRIM_BLUR_PX}px)`],
])(
  'gives a plain touch backdrop the plain dim under a coarse pointer: %s',
  async (coarse, background, filter) => {
    if (coarse) matching.add('(pointer: coarse)');
    await act(async () =>
      root.render(createElement(ModalScrim, { opacity: fadeValue(), touchBackdrop: 'plain' }))
    );
    const scrim = host.querySelector('[data-testid="modal-scrim"]');
    expect(scrim.style.background).toBe(background);
    expect(scrim.style.backdropFilter).toBe(filter);
  }
);
