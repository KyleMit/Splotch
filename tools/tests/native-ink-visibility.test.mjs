// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_SCAN_IDLE_MS,
  inkVerdict,
  useVisibleInk,
} from '../../experiments/native-architecture/src/drawing/inkVisibility.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';

const point = { x: 10, y: 10 };
const pen = { brush: 'pen', width: 8, color: 'Purple', points: [point] };
const eraser = { brush: 'eraser', width: 16, points: [point] };
const drawn = (...strokes) => ({ ...emptyDrawing(), strokes });

let root;
let host;
let visible;
let scan;

function Probe({ drawing, idle }) {
  visible = useVisibleInk(drawing, idle, scan);
  return null;
}

async function show(drawing, idle = true) {
  await act(async () => root.render(createElement(Probe, { drawing, idle })));
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
    await show(erased);
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

  it('counts erased ink as visible until the idle scan finds the page blank', async () => {
    const erased = drawn(pen, eraser);
    expect(inkVerdict(erased)).toBe('scan');
    await show(erased, false);
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
    const blank = drawn(pen, eraser, eraser);
    scan.mockImplementation(async (drawing) => drawing === blank);
    await show(partial);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(visible).toBe(true);
    await show(blank);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(visible).toBe(false);
    await show(partial);
    expect(visible).toBe(true);
    await show(blank);
    expect(visible).toBe(false);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('waits another idle stretch when the paper is busy, and stops at a page it cannot read', async () => {
    const erased = drawn(pen, eraser);
    scan.mockResolvedValueOnce('busy').mockResolvedValueOnce(true);
    await show(erased);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(scan).toHaveBeenCalledOnce();
    expect(visible).toBe(true);
    await idleFor(EMPTY_SCAN_IDLE_MS);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(visible).toBe(false);
    const unreadable = drawn(pen, eraser, eraser);
    scan.mockRejectedValueOnce(new Error('no pixels'));
    await show(unreadable);
    await idleFor(EMPTY_SCAN_IDLE_MS * 3);
    expect(scan).toHaveBeenCalledTimes(3);
    expect(visible).toBe(true);
  });

  it('waits as long as the shipping eraser scan does', () => {
    const shipping = readFileSync(
      join(import.meta.dirname, '../../web/src/lib/drawing/idleEmptyScan.ts'),
      'utf8'
    );
    expect(Number(shipping.match(/EMPTY_SCAN_IDLE_MS = (\d+);/)?.[1])).toBe(EMPTY_SCAN_IDLE_MS);
  });
});
