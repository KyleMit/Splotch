// @vitest-environment happy-dom

import { join } from 'node:path';
import { act, createElement, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { addStroke, strokeStyle } from '../../src/drawing/model.ts';
import { useUndoAction } from '../../src/useUndoAction.ts';
import {
  UNAVAILABLE_FLASH_KEYFRAMES,
  UNAVAILABLE_FLASH_MS,
  UNAVAILABLE_GLOW_FADE_SPREAD_PX,
  UNAVAILABLE_GLOW_BRAND_SHARE,
  UNAVAILABLE_GLOW_SPREAD_PX,
  UNAVAILABLE_SHAKE_KEYFRAMES,
  UNAVAILABLE_SHAKE_MS,
} from '../../src/rsdDrawing/unavailableKeyframes.ts';

vi.mock('react-native', async () => await import('react-native-web'));
vi.mock('../../src/drawing/DrawingAppearance.tsx', () => ({
  useDrawingTheme: () => ({ brandWash: '#ede7f6' }),
}));
const timelines = vi.hoisted(() => []);
vi.mock('../../src/rsdDrawing/keyframeMotion.ts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    keyframeTimeline(progress, keyframes, durationMs, delayMs, elapsedMs) {
      timelines.push({ durationMs, elapsedMs });
      return actual.keyframeTimeline(progress, keyframes, durationMs, delayMs, elapsedMs);
    },
  };
});
const { RsdUnavailableCue } = await import('../../src/rsdDrawing/RsdUnavailableCue.tsx');
const EASE_IN_OUT = [0.42, 0, 0.58, 1];

describe("the native unavailable cue against app.css's .action-unavailable", () => {
  it('shakes the shipping offsets and swings over the shake duration, ease-in-out between them', () => {
    expect(UNAVAILABLE_SHAKE_MS).toBe(460);
    expect(UNAVAILABLE_SHAKE_KEYFRAMES.map((frame) => [frame.at, frame.x, frame.rotate])).toEqual([
      [0, 0, 0],
      [0.14, -5, -3.2],
      [0.32, 5, 3.2],
      [0.52, -3, -1.8],
      [0.7, 2, 1],
      [0.86, -0.8, -0.4],
      [1, 0, 0],
    ]);
    for (const frame of UNAVAILABLE_SHAKE_KEYFRAMES.slice(0, -1))
      expect(frame.easing).toEqual(EASE_IN_OUT);
  });

  it('flashes the brand wash and glow ring over the flash duration, the glow spreading as it fades', () => {
    expect(UNAVAILABLE_FLASH_MS).toBe(520);
    expect(UNAVAILABLE_GLOW_SPREAD_PX).toBe(10);
    expect(UNAVAILABLE_GLOW_FADE_SPREAD_PX).toBe(16);
    expect(UNAVAILABLE_GLOW_BRAND_SHARE).toBe(0.42);
    expect(
      UNAVAILABLE_FLASH_KEYFRAMES.map((frame) => [frame.at, frame.lit, frame.glow, frame.spreadPx])
    ).toEqual([
      [0, 0, 0, 10],
      [0.12, 1, 1, 10],
      [0.62, 1, 1, 10],
      [1, 0, 0, 16],
    ]);
    for (const frame of UNAVAILABLE_FLASH_KEYFRAMES.slice(0, -1))
      expect(frame.easing).toEqual(EASE_IN_OUT);
  });
});

let host, root;
beforeEach(() => {
  timelines.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function undoOwner(initial, expose) {
  return function Owner() {
    const [history, setHistory] = useState(initial);
    const historyRef = useRef(history);
    historyRef.current = history;
    const actions = useUndoAction({
      historyRef,
      setHistory,
      command: useRef(false),
      surface: useRef({ lockInput: () => () => {} }),
      blocked: () => false,
      inputActive: () => false,
      setNotice: () => {},
      report: (error) => {
        throw error;
      },
    });
    expose({ history, ...actions });
    return null;
  };
}

describe('Undo pressed at the end of history', () => {
  const blank = adoptedDrawing({ width: 400, height: 300, pixelRatio: 1 });

  it('answers each press with a new unavailable cue and leaves the history alone', async () => {
    let owner;
    const initial = { drawing: blank, undo: [] };
    await act(async () =>
      root.render(createElement(undoOwner(initial, (value) => (owner = value))))
    );
    expect(owner.unavailableFeedback).toBeNull();
    vi.spyOn(performance, 'now').mockReturnValue(5);
    await act(async () => owner.undoFromButton(false));
    expect(owner.unavailableFeedback).toEqual({ id: 1, startedAt: 5, reduced: false });
    await act(async () => owner.undoFromButton(true));
    expect(owner.unavailableFeedback).toEqual({ id: 2, startedAt: 5, reduced: true });
    expect(owner.history).toBe(initial);
    expect(owner.undoFeedback).toBeNull();
  });

  it('undoes instead, with no unavailable cue, while a stroke is left to undo', async () => {
    let owner;
    const stroke = { ...strokeStyle('pen', 'Green', blank), points: [{ x: 30, y: 30 }] };
    const initial = addStroke({ drawing: blank, undo: [] }, stroke);
    await act(async () =>
      root.render(createElement(undoOwner(initial, (value) => (owner = value))))
    );
    await act(async () => owner.undoFromButton(false));
    expect(owner.history.drawing.strokes).toHaveLength(0);
    expect(owner.unavailableFeedback).toBeNull();
  });
});

describe('RsdUnavailableCue', () => {
  const render = (feedback) =>
    act(async () =>
      root.render(
        createElement(
          RsdUnavailableCue,
          { feedback, size: 60, radius: 18, borderPx: 2, lit: createElement('i') },
          createElement('b')
        )
      )
    );

  it('starts nothing until a press, then shakes and flashes from the press', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    await render(null);
    expect(timelines).toEqual([]);
    expect(host.querySelector('[data-testid="rsd-unavailable-flash"]')).not.toBeNull();
    await render({ id: 1, startedAt: 100, reduced: false });
    expect(timelines.map(({ durationMs }) => durationMs).sort()).toEqual(
      [UNAVAILABLE_SHAKE_MS, UNAVAILABLE_FLASH_MS].sort()
    );
  });

  // The tile keeps its DOM node, and so its keyboard focus, from before a press through the cue.
  it('plays over the tile it wraps without remounting it', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const tile = (feedback) =>
      createElement(
        RsdUnavailableCue,
        { feedback, size: 60, radius: 18, borderPx: 2, lit: createElement('i') },
        createElement('button', { 'aria-label': 'Undo' })
      );
    await act(async () => root.render(tile(null)));
    const button = host.querySelector('[aria-label="Undo"]');
    button.focus();
    await act(async () => root.render(tile({ id: 1, startedAt: 100, reduced: false })));
    await act(async () => root.render(tile({ id: 2, startedAt: 100, reduced: true })));
    expect(host.querySelector('[aria-label="Undo"]')).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  // The web loads the motion with the other Undo cues. Negative control: a wrapper that renders
  // the bare tile until the chunk lands, then wraps it, remounts the button and drops its focus.
  it('keeps the tile mounted and focused when the web chunk with its motion arrives late', async () => {
    const SRC = join(import.meta.dirname, '../../src/rsdDrawing/');
    let release;
    const held = new Promise((resolve) => (release = resolve));
    vi.resetModules();
    vi.doMock(`${SRC}undoFeedbackChunk.web.ts`, async () => {
      await held;
      return vi.importActual(`${SRC}unavailableMotion.tsx`);
    });
    vi.doMock(`${SRC}unavailableMotionSurface.ts`, () =>
      vi.importActual(`${SRC}unavailableMotionSurface.web.ts`)
    );
    const { RsdUnavailableCue: WebCue } = await import(`${SRC}RsdUnavailableCue.tsx`);
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const tile = (feedback) =>
      createElement(
        WebCue,
        { feedback, size: 60, radius: 18, borderPx: 2, lit: createElement('i') },
        createElement('button', { 'aria-label': 'Undo' })
      );
    await act(async () => root.render(tile(null)));
    const button = host.querySelector('[aria-label="Undo"]');
    button.focus();
    await act(async () => root.render(tile({ id: 1, startedAt: 100, reduced: false })));
    expect(host.querySelector('[data-testid="rsd-unavailable-flash"]')).toBeNull();
    await act(async () => release());
    await act(() =>
      vi.waitFor(() =>
        expect(host.querySelector('[data-testid="rsd-unavailable-flash"]')).not.toBeNull()
      )
    );
    expect(host.querySelector('[aria-label="Undo"]')).toBe(button);
    expect(document.activeElement).toBe(button);
    vi.doUnmock(`${SRC}undoFeedbackChunk.web.ts`);
    vi.doUnmock(`${SRC}unavailableMotionSurface.ts`);
  });

  it('flashes without the shake under Reduce Motion, and leaves a cue that has run out at rest', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    await render({ id: 1, startedAt: 100, reduced: true });
    expect(timelines.map(({ durationMs }) => durationMs)).toEqual([UNAVAILABLE_FLASH_MS]);
    timelines.length = 0;
    await render({ id: 2, startedAt: 100 - UNAVAILABLE_FLASH_MS, reduced: false });
    expect(timelines).toEqual([]);
  });
});
