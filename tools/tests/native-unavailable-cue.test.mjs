// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { addStroke, strokeStyle } from '../../experiments/native-architecture/src/drawing/model.ts';
import { useUndoAction } from '../../experiments/native-architecture/src/useUndoAction.ts';
import {
  UNAVAILABLE_FLASH_KEYFRAMES,
  UNAVAILABLE_FLASH_MS,
  UNAVAILABLE_GLOW_BRAND_SHARE,
  UNAVAILABLE_GLOW_FADE_SPREAD_PX,
  UNAVAILABLE_GLOW_SPREAD_PX,
  UNAVAILABLE_SHAKE_KEYFRAMES,
  UNAVAILABLE_SHAKE_MS,
} from '../../experiments/native-architecture/src/rsdDrawing/unavailableKeyframes.ts';

vi.mock('react-native', async () => await import('react-native-web'));
vi.mock('../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx', () => ({
  useDrawingTheme: () => ({ brandWash: '#ede7f6' }),
}));
const timelines = vi.hoisted(() => []);
vi.mock(
  '../../experiments/native-architecture/src/rsdDrawing/keyframeMotion.ts',
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      keyframeTimeline(progress, keyframes, durationMs, delayMs, elapsedMs) {
        timelines.push({ durationMs, elapsedMs });
        return actual.keyframeTimeline(progress, keyframes, durationMs, delayMs, elapsedMs);
      },
    };
  }
);
const { RsdUnavailableCue } =
  await import('../../experiments/native-architecture/src/rsdDrawing/RsdUnavailableCue.tsx');

const css = readFileSync(join(import.meta.dirname, '../../web/src/app.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);
const EASE_IN_OUT = [0.42, 0, 0.58, 1];

function block(prelude) {
  const start = css.indexOf(`${prelude} {`);
  expect(start, prelude).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index++) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(css.indexOf('{', start) + 1, index);
  }
  throw new Error(`Unclosed ${prelude}`);
}

function keyframes(name) {
  return [...block(`@keyframes ${name}`).matchAll(/([\d%,\s]+)\{([^}]*)\}/g)].flatMap(
    ([, offsets, declarations]) =>
      offsets
        .split(',')
        .map((offset) => offset.trim())
        .filter(Boolean)
        .map((offset) => ({ at: Number(offset.replace('%', '')) / 100, declarations }))
  );
}

describe("the native unavailable cue against app.css's .action-unavailable", () => {
  it('shakes the shipping offsets and swings over the shake duration, ease-in-out between them', () => {
    const animation = block('.action-unavailable').replace(/\s+/g, ' ');
    expect(animation).toContain(`action-unavailable-shake ${UNAVAILABLE_SHAKE_MS}ms ease-in-out`);
    const swings = keyframes('action-unavailable-shake').map(({ at, declarations }) => ({
      at,
      x: Number(declarations.match(/translateX\((-?[\d.]+)px\)/)[1]),
      rotate: Number(declarations.match(/rotate\((-?[\d.]+)deg\)/)[1]),
    }));
    expect(
      UNAVAILABLE_SHAKE_KEYFRAMES.slice(1, -1).map(({ easing: _, ...frame }) => frame)
    ).toEqual(swings);
    for (const frame of [UNAVAILABLE_SHAKE_KEYFRAMES[0], UNAVAILABLE_SHAKE_KEYFRAMES.at(-1)])
      expect(frame).toMatchObject({ x: 0, rotate: 0 });
    for (const frame of UNAVAILABLE_SHAKE_KEYFRAMES.slice(0, -1))
      expect(frame.easing).toEqual(EASE_IN_OUT);
  });

  it('flashes the brand wash and glow ring over the flash duration, the glow spreading as it fades', () => {
    const rule = block('.action-unavailable');
    expect(rule.match(/--action-unavailable-flash-duration:\s*(\d+)ms/)[1]).toBe(
      String(UNAVAILABLE_FLASH_MS)
    );
    expect(rule.replace(/\s+/g, ' ')).toContain(
      'action-unavailable-flash var(--action-unavailable-flash-duration) ease-in-out'
    );
    const frames = keyframes('action-unavailable-flash');
    const peaks = frames.filter(({ declarations }) => declarations.includes('opacity: 1'));
    expect(peaks.map(({ at }) => at)).toEqual(
      UNAVAILABLE_FLASH_KEYFRAMES.filter(({ lit }) => lit === 1).map(({ at }) => at)
    );
    const ring = (declarations) =>
      declarations.match(/box-shadow:\s*0 0 0 (\d+)px color-mix\(in srgb, var\(--brand\) (\d+)%/);
    const [, spread, share] = ring(peaks[0].declarations);
    expect(Number(spread)).toBe(UNAVAILABLE_GLOW_SPREAD_PX);
    expect(Number(share) / 100).toBe(UNAVAILABLE_GLOW_BRAND_SHARE);
    const [, fadeSpread, fadeShare] = ring(frames.at(-1).declarations);
    expect(frames.at(-1).at).toBe(1);
    expect(Number(fadeSpread)).toBe(UNAVAILABLE_GLOW_FADE_SPREAD_PX);
    expect(Number(fadeShare)).toBe(0);
    expect(UNAVAILABLE_FLASH_KEYFRAMES.at(-1)).toMatchObject({
      lit: 0,
      glow: 0,
      spreadPx: UNAVAILABLE_GLOW_FADE_SPREAD_PX,
    });
  });

  it('keeps the flash alone under Reduce Motion', () => {
    expect(block('.action-unavailable[data-start-reduced-motion]').replace(/\s+/g, ' ')).toContain(
      'animation: action-unavailable-flash var(--action-unavailable-flash-duration)'
    );
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

  it('flashes without the shake under Reduce Motion, and leaves a cue that has run out at rest', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    await render({ id: 1, startedAt: 100, reduced: true });
    expect(timelines.map(({ durationMs }) => durationMs)).toEqual([UNAVAILABLE_FLASH_MS]);
    timelines.length = 0;
    await render({ id: 2, startedAt: 100 - UNAVAILABLE_FLASH_MS, reduced: false });
    expect(timelines).toEqual([]);
  });
});
