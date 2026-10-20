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

// A dialog card's lift above the on-screen keyboard. Edge-to-edge Android no longer resizes the
// window for the keyboard (adjustResize), and nothing else moved the card, so a focused field near
// its bottom sat behind the keys (#3076). The card lifts just enough to clear the focused field.
export function useKeyboardLift(active: boolean) {
  const lift = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  useEffect(() => {
    if (!active) return;
    const move = (to: number, duration: number) => {
      current.current = to;
      Animated.timing(lift, {
        toValue: to,
        duration: duration || FALLBACK_LIFT_MS,
        useNativeDriver: true,
      }).start();
    };
    const shown = Keyboard.addListener(SHOW, (event: KeyboardEvent) => {
      focusedTextInput()?.measureInWindow((_x, y, _width, height) =>
        move(
          keyboardLiftTarget(current.current, y + height, event.endCoordinates.screenY),
          event.duration
        )
      );
    });
    const hidden = Keyboard.addListener(HIDE, (event: KeyboardEvent) => move(0, event.duration));
    return () => {
      shown.remove();
      hidden.remove();
      current.current = 0;
      lift.setValue(0);
    };
  }, [active, lift]);
  return lift;
}
