// The room left between the focused field and the keyboard's top edge.
export const KEYBOARD_CLEARANCE_PX = 16;

// How far a dialog card lifts (0 or negative: upward) to keep the focused field above the keyboard.
// The field's bottom is measured in the window, so it already includes the card's current lift.
export function keyboardLiftTarget(currentLift: number, fieldBottom: number, keyboardTop: number) {
  return Math.min(0, currentLift + keyboardTop - KEYBOARD_CLEARANCE_PX - fieldBottom);
}
