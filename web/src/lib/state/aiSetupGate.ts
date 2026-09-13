import { buttonCenter, type Origin } from './modal.svelte';
import { requireParentalGate } from './parentalGate.svelte';

// Switching an AI setting on is where a parent opts the device into sending
// something — the free-allowance check leaves with the install's one-way code
// the moment AI pictures turn on — so that direction runs behind the AI setup
// check. Switching one off only narrows what can leave, and never asks: a child
// can always make Splotch do less.
export function setAiSettingBehindGate(
  next: boolean,
  apply: (next: boolean) => void,
  controlId: string
) {
  if (!next) {
    apply(false);
    return;
  }
  requireParentalGate('aiSetup', () => apply(true), controlOrigin(controlId));
}

function controlOrigin(controlId: string): Origin | null {
  const control = document.getElementById(controlId);
  return control ? buttonCenter(control) : null;
}
