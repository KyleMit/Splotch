// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let idleCallbacks: Array<() => void>;
let frameCallbacks: Array<(time: number) => void>;
let frameTime: number;
let scheduleInteractionIdle: typeof import('./idle').scheduleInteractionIdle;

function flushIdle() {
  const callbacks = idleCallbacks;
  idleCallbacks = [];
  callbacks.forEach((callback) => callback());
}

function flushFrames(count: number) {
  for (let index = 0; index < count; index += 1) {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    frameTime += 16;
    callbacks.forEach((callback) => callback(frameTime));
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  idleCallbacks = [];
  frameCallbacks = [];
  frameTime = 0;
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    idleCallbacks.push(callback);
    return idleCallbacks.length;
  });
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.resetModules();
  ({ scheduleInteractionIdle } = await import('./idle'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits for click, keyboard, wheel, and pointer activity to become quiet', () => {
  const fn = vi.fn();
  scheduleInteractionIdle(fn);

  flushIdle();
  for (let elapsed = 250; elapsed <= 750; elapsed += 250) {
    vi.advanceTimersByTime(250);
    flushIdle();
  }
  flushFrames(1);
  window.dispatchEvent(new MouseEvent('click'));
  flushFrames(1);
  expect(fn).not.toHaveBeenCalled();

  for (const event of [
    new KeyboardEvent('keydown', { key: 'Tab' }),
    new WheelEvent('wheel'),
    new PointerEvent('pointerdown', { pointerId: 1 }),
    new PointerEvent('pointerup', { pointerId: 1 }),
  ]) {
    vi.advanceTimersByTime(250);
    flushIdle();
    window.dispatchEvent(event);
    expect(fn).not.toHaveBeenCalled();
  }

  for (let elapsed = 250; elapsed <= 750; elapsed += 250) {
    vi.advanceTimersByTime(250);
    flushIdle();
  }
  flushFrames(2);
  expect(fn).toHaveBeenCalledOnce();
});

it('spaces background slices even when no input occurred', () => {
  const fn = vi.fn();
  scheduleInteractionIdle(fn);

  flushIdle();
  vi.advanceTimersByTime(749);
  flushIdle();
  flushFrames(2);
  expect(fn).not.toHaveBeenCalled();

  vi.advanceTimersByTime(250);
  flushIdle();
  flushFrames(2);
  expect(fn).toHaveBeenCalledOnce();
});

it('cancellation covers a pending native-idle retry', () => {
  const fn = vi.fn();
  const cancel = scheduleInteractionIdle(fn);
  flushIdle();
  cancel();

  vi.advanceTimersByTime(2_000);
  flushIdle();
  flushFrames(2);
  expect(fn).not.toHaveBeenCalled();
});
