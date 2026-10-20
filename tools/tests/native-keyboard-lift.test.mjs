import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_CLEARANCE_PX,
  keyboardLiftTarget,
} from '../../experiments/native-architecture/src/rsdDrawing/keyboardLiftTarget.ts';

// The Galaxy's API key field sat behind the on-screen keyboard (#3076): edge-to-edge Android no
// longer resizes the window, so the dialog card lifts itself just enough to clear the field.
describe('a dialog card lifted above the on-screen keyboard', () => {
  const keyboardTop = 500;

  it('lifts a covered field to sit its clearance above the keyboard', () => {
    expect(keyboardLiftTarget(0, 560, keyboardTop)).toBe(-(60 + KEYBOARD_CLEARANCE_PX));
  });

  it('leaves a field already clear of the keyboard where it is', () => {
    expect(keyboardLiftTarget(0, keyboardTop - KEYBOARD_CLEARANCE_PX - 1, keyboardTop)).toBe(0);
  });

  it('measures from the lift the card already has when a lower field takes focus', () => {
    const first = keyboardLiftTarget(0, 560, keyboardTop);
    // The next field down, measured in the window while the card sits lifted by `first`.
    const second = keyboardLiftTarget(first, 560 + first + 80, keyboardTop);
    expect(second).toBe(first - 80);
  });

  it('settles back down when a higher field takes focus', () => {
    const lifted = keyboardLiftTarget(0, 600, keyboardTop);
    expect(keyboardLiftTarget(lifted, 200 + lifted, keyboardTop)).toBe(0);
  });
});
