import { afterEach, expect, it, vi } from 'vitest';
import { excludeScrollportGutter } from './scrollCue';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  let resize: (() => void) | undefined;
  let gutter = 15;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  const frame = document.createElement('div');
  const scrollport = document.createElement('div');
  const cue = document.createElement('div');
  frame.append(scrollport, cue);
  Object.defineProperties(scrollport, {
    offsetWidth: { get: () => 300 },
    clientWidth: { get: () => 300 - gutter },
  });
  return {
    cue,
    scrollport,
    observe,
    disconnect,
    resizeGutter(width: number) {
      gutter = width;
      resize?.();
    },
  };
}

it('insets the fade when a classic scrollbar takes space and releases it when the gutter disappears', () => {
  const fixture = setup();
  excludeScrollportGutter(fixture.cue);
  expect(fixture.cue.style.right).toBe('15px');
  expect(fixture.observe).toHaveBeenCalledWith(fixture.scrollport);
  fixture.resizeGutter(0);
  expect(fixture.cue.style.right).toBe('0px');
});

it('disconnects the observer and removes its inset on teardown', () => {
  const fixture = setup();
  const handle = excludeScrollportGutter(fixture.cue);
  handle?.destroy();
  expect(fixture.disconnect).toHaveBeenCalledOnce();
  expect(fixture.cue.style.right).toBe('');
});

it('leaves a fade without a scrolling sibling alone', () => {
  expect(excludeScrollportGutter(document.createElement('div'))).toBeUndefined();
});
