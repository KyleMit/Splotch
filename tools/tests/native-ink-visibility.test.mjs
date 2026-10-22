// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SCAN_IDLE_MS, inkVerdict, useVisibleInk } from '../../src/drawing/inkVisibility.ts';
import { emptyDrawing, createHistory, clearDrawing, undoDrawing } from '../../src/drawing/model.ts';
import { adoptPaper } from '../../src/drawing/paperSpace.ts';

const point = { x: 10, y: 10 };
const pen = { brush: 'pen', width: 8, color: 'Purple', points: [point] };
const eraser = { brush: 'eraser', width: 16, points: [point] };
const drawn = (...strokes) => ({ ...emptyDrawing(), strokes });

let root;
let host;
let visible;
let ink;
let scan;

function Probe({ drawing, idle }) {
  ink = useVisibleInk(drawing, idle, scan);
  visible = ink.visible;
  return null;
}

async function show(drawing, idle = true) {
  await act(async () => root.render(createElement(Probe, { drawing, idle })));
}

// An eraser lift commits this drawing, as the screen's cohort commit reports it.
async function lift(drawing, idle = true) {
  await show(drawing, idle);
  await act(async () => ink.erased(drawing));
}

async function idleFor(ms) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  scan = vi.fn(async () => true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('the drawing owner’s visible-ink state', () => {
  it('reads an eraser-only page as blank without scanning a pixel', async () => {
    const erased = drawn(eraser, eraser);
    expect(inkVerdict(erased)).toBe('blank');
    await lift(erased);
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(visible).toBe(false);
    expect(scan).not.toHaveBeenCalled();
  });

  it('reads ink with no eraser over it as visible without scanning', async () => {
    await show(drawn(pen));
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(visible).toBe(true);
    expect(scan).not.toHaveBeenCalled();
  });

  it('counts erased ink as visible until the idle scan after the eraser lift finds it blank', async () => {
    const erased = drawn(pen, eraser);
    expect(inkVerdict(erased)).toBe('scan');
    await lift(erased, false);
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(scan).not.toHaveBeenCalled();
    expect(visible).toBe(true);
    await show(erased, true);
    await idleFor(EMPTY_SCAN_IDLE_MS - 1);
    expect(scan).not.toHaveBeenCalled();
    await idleFor(1);
    expect(scan).toHaveBeenCalledExactlyOnceWith(erased);
    expect(visible).toBe(false);
  });

  it('keeps erased ink that still shows enabled, and remembers each answer for Undo', async () => {
    const partial = drawn(pen, eraser);
    const blank = drawn(...partial.strokes, eraser);
    scan.mockImplementation(async (drawing) => drawing === blank);
    await lift(partial);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(visible).toBe(true);
    await lift(blank);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(visible).toBe(false);
    await show(partial);
    expect(visible).toBe(true);
    await show(blank);
    expect(visible).toBe(false);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('keeps a scan through Clear Undo while isolating page and paper changes', async () => {
    const partial = drawn(pen, eraser);
    await lift(partial);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(ink.empty(partial)).toBe(true);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.71);
    let restored;
    try {
      restored = undoDrawing(clearDrawing(createHistory(partial), false)).drawing;
    } finally {
      random.mockRestore();
    }
    expect(restored).not.toBe(partial);
    expect(restored.rainbow).toBe(7);
    await show(restored);
    expect(visible).toBe(false);
    expect(ink.empty(restored)).toBe(true);
    for (const changed of [
      { ...restored, pageId: 'turtle' },
      { ...restored, paper: adoptPaper(768, 1024, 1) },
    ]) {
      await show(changed);
      expect(visible).toBe(true);
      expect(ink.empty(changed)).toBeUndefined();
    }
    expect(scan).toHaveBeenCalledOnce();
  });

  it('waits another idle stretch when the paper is busy, and stops at a page it cannot read', async () => {
    const erased = drawn(pen, eraser);
    scan.mockResolvedValueOnce('busy').mockResolvedValueOnce(true);
    await lift(erased);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(scan).toHaveBeenCalledOnce();
    expect(visible).toBe(true);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(visible).toBe(false);
    const unreadable = drawn(...erased.strokes, eraser);
    scan.mockRejectedValueOnce(new Error('no pixels'));
    await lift(unreadable);
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(scan).toHaveBeenCalledTimes(3);
    expect(visible).toBe(true);
  });

  it('scans only after an eraser lift, never a restored or undone page', async () => {
    const restored = drawn(pen, eraser);
    await show(restored);
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(scan).not.toHaveBeenCalled();
    expect(visible).toBe(true);
    await show(drawn(pen));
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(scan).not.toHaveBeenCalled();
  });
});
