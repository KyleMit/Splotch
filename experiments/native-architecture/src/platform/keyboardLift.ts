import { useEffect, useRef } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { focusedTextInput } from '../drawing/Text';
import { Animated } from './animated';
import { keyboardLiftTarget } from '../rsdDrawing/keyboardLiftTarget';

// iOS announces the keyboard before it moves, so the card travels with it; Android only after.
const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
// Android's keyboard events carry no duration; this matches its own slide.
const FALLBACK_LIFT_MS = 200;
// No keyboard event marks focus moving to another field under an open keyboard, so while it is up
// the lift checks which field holds focus this often.
const FOCUS_CHECK_MS = 150;

// A dialog card's lift above the on-screen keyboard. Edge-to-edge Android no longer resizes the
// window for the keyboard (adjustResize), and nothing else moved the card, so a focused field near
// its bottom sat behind the keys (#3076). The card lifts just enough to clear the focused field.
export function useKeyboardLift(active: boolean) {
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    let keyboardTop: number | null = null;
    let focused: ReturnType<typeof focusedTextInput>;
    let focusCheck: ReturnType<typeof setInterval> | undefined;
    // Where the card rests once its last move lands. The lift is natively driven, so its value is
    // never read back: a field is only measured while the card is at rest, and a change that
    // arrives mid-move waits for the move to land.
    let settled = 0;
    let moving = 0;
    let waiting: number | null = null;
    let disposed = false;
    const move = (to: number, duration: number) => {
      const id = ++moving;
      Animated.timing(lift, {
        toValue: to,
        duration: duration || FALLBACK_LIFT_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (disposed || id !== moving) return;
        moving = 0;
        if (!finished) return;
        settled = to;
        if (waiting !== null) {
          const next = waiting;
          waiting = null;
          relift(next);
        }
      });
    };
    const relift = (duration: number) => {
      const top = keyboardTop;
      const field = focusedTextInput();
      focused = field;
      if (top === null || !field) return;
      if (moving) {
        waiting = duration;
        return;
      }
      field.measureInWindow((_x, y, _width, height) => {
        if (!disposed && keyboardTop === top && !moving)
          move(keyboardLiftTarget(settled, y + height, top), duration);
      });
    };
    const shown = Keyboard.addListener(SHOW, (event: KeyboardEvent) => {
      keyboardTop = event.endCoordinates.screenY;
      relift(event.duration);
      focusCheck ??= setInterval(() => {
        if (focusedTextInput() !== focused) relift(FALLBACK_LIFT_MS);
      }, FOCUS_CHECK_MS);
    });
    const hidden = Keyboard.addListener(HIDE, (event: KeyboardEvent) => {
      keyboardTop = null;
      focused = undefined;
      waiting = null;
      clearInterval(focusCheck);
      focusCheck = undefined;
      move(0, event.duration);
    });
    return () => {
      // Before the reset below, which stops a move in flight and calls its completion.
      disposed = true;
      waiting = null;
      shown.remove();
      hidden.remove();
      clearInterval(focusCheck);
      lift.setValue(0);
    };
  }, [active, lift]);
  return lift;
}
