// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DRAWING_LIVE_ATTRIBUTE,
  EARLY_POINTERS_GLOBAL,
} from '../../src/platform/firstFrameContract.ts';

vi.mock('react-native', () => ({
  View: forwardRef(function View({ children, testID }, ref) {
    return createElement('div', { ref, 'data-testid': testID }, children);
  }),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
const { PaperInputView } = await import('../../src/drawing/PaperInputView.web.tsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ON_PAPER = {
  pointerId: 4,
  pointerType: 'touch',
  pageX: 50,
  pageY: 60,
  clientX: 50,
  clientY: 60,
};
const OFF_PAPER = {
  pointerId: 5,
  pointerType: 'touch',
  pageX: 900,
  pageY: 60,
  clientX: 900,
  clientY: 60,
};

let root;
let ready = false;
let frames = [];
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  ready = false;
  frames = [];
  delete window[EARLY_POINTERS_GLOBAL];
  document.body.innerHTML = '';
});

function mountPaper() {
  const onInput = vi.fn();
  const onClaim = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  document.elementFromPoint = (x) =>
    x === ON_PAPER.clientX ? document.querySelector('[data-testid=paper]') : document.body;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(PaperInputView, { testID: 'paper', onInput, onClaim, engineReady: () => ready })
    )
  );
  return { onInput, onClaim, node: document.querySelector('[data-testid=paper]') };
}
const nextFrame = () => frames.splice(0).forEach((callback) => callback());
const live = () => document.documentElement.hasAttribute(DRAWING_LIVE_ATTRIBUTE);
const down = (node, pointerId) =>
  node.dispatchEvent(
    new PointerEvent('pointerdown', { pointerId, button: 0, clientX: 50, clientY: 60 })
  );

it('holds the shell’s early fingers until the engine is ready, then starts each where it is now', () => {
  const record = { 4: ON_PAPER, 5: OFF_PAPER };
  window[EARLY_POINTERS_GLOBAL] = record;
  const { onInput, onClaim, node } = mountPaper();
  down(node, 6);
  nextFrame();
  expect(onInput).not.toHaveBeenCalled();
  expect(live()).toBe(false);
  ready = true;
  nextFrame();
  expect(live()).toBe(true);
  expect(onClaim).toHaveBeenCalledTimes(1);
  expect(onInput).toHaveBeenCalledTimes(1);
  const [packet] = onInput.mock.calls[0];
  expect(packet).toMatchObject({ phase: 'start', changed: ['4'] });
  expect(packet.contacts).toEqual([
    expect.objectContaining({
      identifier: '4',
      tool: 'touch',
      samples: [expect.objectContaining({ pageX: 50, pageY: 60 })],
    }),
  ]);
  expect(window[EARLY_POINTERS_GLOBAL]).toBe(record);
  expect(record).toEqual({});
  node.dispatchEvent(new PointerEvent('pointermove', { pointerId: 4, clientX: 70, clientY: 80 }));
  expect(onInput.mock.calls[1][0]).toMatchObject({ phase: 'move', changed: ['4'] });
});

it('takes fingers as before once live, and clears the stamp when it goes', () => {
  ready = true;
  const { onInput, node } = mountPaper();
  expect(live()).toBe(true);
  down(node, 6);
  expect(onInput.mock.calls[0][0]).toMatchObject({ phase: 'start', changed: ['6'] });
  act(() => root.unmount());
  root = undefined;
  expect(live()).toBe(false);
});

it('fails loudly on an early-pointer record it cannot read, and still goes live', () => {
  window[EARLY_POINTERS_GLOBAL] = { 4: { pointerId: 'four' } };
  const { onInput, node } = mountPaper();
  ready = true;
  expect(() => nextFrame()).toThrow('The shell recorded an early pointer this app cannot read.');
  expect(live()).toBe(true);
  down(node, 6);
  expect(onInput).toHaveBeenCalledTimes(1);
});
