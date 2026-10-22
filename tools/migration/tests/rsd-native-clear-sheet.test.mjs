import { host, records } from './rsd-native-selection-host.mjs';

import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { CLEAR_SHEET_DURATION_MS } from '../../../src/clear/dragToClear.ts';
import { Animated } from '../../../src/platform/animated.ts';
import {
  commitClear,
  inkedDrawing,
  layout,
  mountClear,
  rendered,
  settle,
} from './rsd-native-clear-fixture.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('grains the cover and departing art, uncovering the next drawing before the flight ends', async () => {
  vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  let finish;
  const drawing = { ...inkedDrawing(), pageId: 'sunshine' };
  const ink = { image: { dispose: vi.fn() }, paper: { x: 0, y: 0, width: 804, height: 1520 } };
  await mountClear({
    drawing,
    departingInk: () => ink,
    clear: vi.fn(() => new Promise((resolve) => (finish = resolve))),
  });
  await layout('rsd-canvas-area', { x: 0, y: 0, width: 402, height: 760 });
  vi.useFakeTimers();
  await commitClear();
  const cover = host.querySelector('[data-testid="rsd-clear-cover"]');
  await act(async () => finish());
  expect(rendered('rsd-clear-cover')).toBe(false);
  const sheet = host.querySelector('[data-testid="rsd-clear-sheet"]');
  for (const paper of [cover, sheet]) {
    expect(paper.firstElementChild.dataset.testid).toBe('paper-texture');
    expect(paper.querySelector('[data-testid="paper-grain"]')).not.toBeNull();
  }
  // The SVG host preserves each primitive: an opaque Rect adds a child before the outline.
  expect(cover.children).toHaveLength(2);
  expect(cover.lastElementChild.childElementCount).toBe(1);
  // The departing page flies the ink layer's pixels under the same outline as the cover.
  expect([...sheet.children].map((child) => child.dataset.testid ?? child.tagName)).toEqual([
    'paper-texture',
    'rsd-clear-sheet-ink',
    cover.lastElementChild.tagName,
  ]);
  expect(sheet.querySelectorAll('path').length).toBe(cover.querySelectorAll('path').length);
  await settle(CLEAR_SHEET_DURATION_MS - 1);
  expect(rendered('rsd-clear-sheet')).toBe(true);
  await settle(1);
  expect(rendered('rsd-clear-sheet')).toBe(false);
});

// Issue 3035: drawing the cleared strokes again through react-native-svg wrapped each Crayon pass in
// a paper-sized filter, and Clear on a scribbled page ran the iPad past its memory limit.
it('flies the ink layer pixels it was handed instead of drawing the cleared strokes again', async () => {
  vi.spyOn(Animated, 'timing').mockReturnValue({ start: vi.fn(), stop: vi.fn() });
  const ink = { image: { dispose: vi.fn() }, paper: { x: 4, y: 6, width: 800, height: 1500 } };
  const departingInk = vi.fn(() => ink);
  await mountClear({ departingInk });
  await layout('rsd-canvas-area', { x: 0, y: 0, width: 402, height: 760 });
  vi.useFakeTimers();
  await commitClear();
  expect(departingInk).toHaveBeenCalledOnce();
  const sheet = host.querySelector('[data-testid="rsd-clear-sheet"]');
  expect(sheet.querySelector('[data-testid="rsd-clear-sheet-ink"]')).not.toBeNull();
  const view = records.props.findLast((props) => props.testID === 'rsd-clear-sheet-ink');
  expect(view.ink).toBe(ink);
  expect(sheet.querySelectorAll('path')).toHaveLength(0);
  expect(ink.image.dispose).not.toHaveBeenCalled();
  await settle(CLEAR_SHEET_DURATION_MS);
  expect(rendered('rsd-clear-sheet')).toBe(false);
  expect(ink.image.dispose).toHaveBeenCalledOnce();
});
