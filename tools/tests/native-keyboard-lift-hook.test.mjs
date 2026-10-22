// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// A keyboard the test raises, fields it focuses, and an animated value whose animations land at
// once or are held mid-flight. A field's measured bottom is its own plus the card's current lift.
const host = vi.hoisted(() => ({
  listeners: new Map(),
  focused: null,
  hold: false,
  held: null,
}));
vi.mock('react-native', () => {
  class Value {
    constructor(value) {
      this.value = value;
    }
    setValue(value) {
      this.value = value;
      // As React Native's does, a reset stops the move in flight and calls its completion.
      const running = this.running;
      this.running = null;
      running?.({ finished: false });
    }
  }
  return {
    Platform: { OS: 'android' },
    Keyboard: {
      addListener(name, listener) {
        host.listeners.set(name, listener);
        return { remove: () => host.listeners.delete(name) };
      },
    },
    Animated: {
      Value,
      timing: (value, { toValue }) => ({
        start(done) {
          const land = () => {
            value.running = null;
            value.setValue(toValue);
            done?.({ finished: true });
          };
          if (host.hold) {
            value.running = done;
            host.held = land;
          } else land();
        },
      }),
    },
  };
});
vi.mock('../../src/drawing/Text.tsx', () => ({
  focusedTextInput: () => host.focused,
}));

const { useKeyboardLift } = await import('../../src/platform/keyboardLift.ts');
const { KEYBOARD_CLEARANCE_PX } = await import('../../src/rsdDrawing/keyboardLiftTarget.ts');

const FIELD_HEIGHT = 40;
let lift;
let container;
let root;
const field = (bottom) => ({
  measureInWindow: (callback) => callback(0, bottom + lift.value - FIELD_HEIGHT, 200, FIELD_HEIGHT),
});
const keyboard = (name, top) =>
  act(() => host.listeners.get(name)({ endCoordinates: { screenY: top }, duration: 0 }));

function Probe() {
  lift = useKeyboardLift(true);
  return null;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host.focused = null;
  host.hold = false;
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root.render(createElement(Probe)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

it('lifts again when focus moves to a lower field under an open keyboard', async () => {
  host.focused = field(560);
  keyboard('keyboardDidShow', 500);
  expect(lift.value).toBe(-(60 + KEYBOARD_CLEARANCE_PX));
  // Android raises no keyboard event for this move; the focus check finds it.
  host.focused = field(640);
  await act(async () => vi.advanceTimersByTime(200));
  expect(640 + lift.value).toBe(500 - KEYBOARD_CLEARANCE_PX);
  keyboard('keyboardDidHide', 0);
  expect(lift.value).toBe(0);
});

it('waits for a move in flight to land before measuring again', () => {
  host.focused = field(560);
  host.hold = true;
  keyboard('keyboardDidShow', 500);
  expect(lift.value).toBe(0);
  // The keyboard grows taller before the first lift has moved the card at all.
  keyboard('keyboardDidShow', 450);
  host.hold = false;
  act(() => host.held());
  expect(560 + lift.value).toBe(450 - KEYBOARD_CLEARANCE_PX);
});

it('does nothing more once the dialog closes with a move in flight and a refit queued', async () => {
  host.focused = field(560);
  host.hold = true;
  keyboard('keyboardDidShow', 500);
  // A lower field takes focus mid-move, so a refit waits for the move to land.
  host.focused = field(640);
  await act(async () => vi.advanceTimersByTime(200));
  host.hold = false;
  // Closing resets the lift, which stops the move and calls its completion unfinished.
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(lift.value).toBe(0);
});
