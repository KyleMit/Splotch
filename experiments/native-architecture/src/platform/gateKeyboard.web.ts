import { useEffect, useRef } from 'react';
import {
  PARENT_GATE_CHECK_KEY,
  PARENT_GATE_KEYPAD_KEYS,
  type ParentGateKey,
} from '../parentCenter/parentGate';

// RsdParentGateKeypad's own markers, which the web build renders as attributes.
const KEYPAD_SELECTOR = '[data-testid="gate-keypad"]';
const CHECK_KEY_SELECTOR = `[data-key="${PARENT_GATE_CHECK_KEY}"]`;

function keypad() {
  return document.querySelector(KEYPAD_SELECTOR);
}

// Enter checks the answer from anywhere on the card except a button outside the keypad (Close, the
// footer), whose own activation it must not hijack; on a keypad key it replaces that key's click.
function isAnswerTarget(target: EventTarget | null) {
  return !(target instanceof HTMLButtonElement) || !!keypad()?.contains(target);
}

// Shipping's ParentalGate.svelte handleKeydown: a hardware keyboard types digits, Backspace deletes
// and Enter checks. The card opens with focus on its Close, so an answer typed from there hands
// focus to the check key, and the Enter that follows checks rather than closing the card.
export function useGateKeyboard(press: (key: ParentGateKey) => void) {
  const handler = useRef(press);
  handler.current = press;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const digit = PARENT_GATE_KEYPAD_KEYS.find(
        (key) => typeof key === 'number' && String(key) === event.key
      );
      if (digit !== undefined) {
        handler.current(digit);
        if (!isAnswerTarget(event.target))
          document.querySelector<HTMLElement>(`${KEYPAD_SELECTOR} ${CHECK_KEY_SELECTOR}`)?.focus();
      } else if (event.key === 'Backspace') handler.current('delete');
      else if (event.key === 'Enter' && isAnswerTarget(event.target)) {
        event.preventDefault();
        handler.current(PARENT_GATE_CHECK_KEY);
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}
