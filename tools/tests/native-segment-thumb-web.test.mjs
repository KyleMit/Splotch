// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('react-native', async () => import('react-native-web'));
vi.mock('../../src/drawing/useReduceMotion.ts', () => ({
  useReduceMotion: () => motion.reduced,
}));
// React Strict DOM reduced to plain elements that carry their merged style, so the transition the
// web thumb asks for is readable.
vi.mock('react-strict-dom', () => {
  const merge = (style) =>
    Object.assign(
      {},
      ...[style].flat(Infinity).filter((entry) => entry && typeof entry === 'object')
    );
  const element = (tag) =>
    forwardRef(({ style, ...props }, ref) =>
      createElement(tag, { ...props, ref, 'data-style': JSON.stringify(merge(style)) })
    );
  return {
    html: { div: element('div') },
    css: {
      create: (styles) => styles,
      defineVars: (values) => values,
      createTheme: () => null,
    },
  };
});

const { SegmentThumb } = await import('../../src/rsdDrawing/segmentThumb.web.tsx');
const { THUMB_TRAVEL_MS } = await import('../../src/rsdDrawing/segmentThumbFace.ts');

const CELLS = [
  { x: 4, width: 80 },
  { x: 88, width: 80 },
];

let root;
let host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  motion.reduced = false;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = (index) =>
  act(async () => root.render(createElement(SegmentThumb, { cell: CELLS[index], index })));
const thumbStyle = () =>
  JSON.parse(host.querySelector('[data-testid="segment-thumb"]').dataset.style);

it('glides between cells when the selection moves, and is placed without one at first', async () => {
  await render(0);
  expect(thumbStyle().transitionDuration).toBeUndefined();
  await render(1);
  expect(thumbStyle()).toMatchObject({
    transform: `translateX(${CELLS[1].x}px)`,
    width: CELLS[1].width,
    transitionDuration: `${THUMB_TRAVEL_MS}ms`,
  });
});

it('drops the glide it is in the moment reduced motion turns on', async () => {
  await render(0);
  await render(1);
  expect(thumbStyle().transitionDuration).toBe(`${THUMB_TRAVEL_MS}ms`);
  motion.reduced = true;
  await render(1);
  expect(thumbStyle().transitionDuration).toBeUndefined();
  expect(thumbStyle().transform).toBe(`translateX(${CELLS[1].x}px)`);
});
