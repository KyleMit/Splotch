import { act } from 'react';
import { expect, vi } from 'vitest';
import { host } from './rsd-native-selection-host.mjs';
import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';

export const GATE_MODAL = '[data-native-modal="Grown-Ups Only"]';

export function gateKey(key) {
  const modal = host.querySelector(GATE_MODAL);
  expect(modal, 'Grown-Ups Only gate').not.toBeNull();
  const buttons = [...modal.querySelectorAll('button')];
  const button =
    typeof key === 'number'
      ? buttons.find((node) => !node.hasAttribute('aria-label') && node.textContent === `${key}`)
      : buttons.find((node) => node.getAttribute('aria-label') === key);
  expect(button, `gate key ${key}`).toBeDefined();
  return button;
}

/** Taps each keypad key in turn: digits by their face, Delete and Check answer by label. */
export async function tapGateKeys(...keys) {
  for (const key of keys) {
    const button = gateKey(key);
    await act(async () => button.click());
  }
}

export function gateProblem() {
  const match = host
    .querySelector(`${GATE_MODAL} [role="img"]`)
    ?.getAttribute('aria-label')
    .match(/^What is (\d) times (\d)\?$/);
  expect(match, 'gate problem').not.toBeNull();
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Lets the solved card's "Unlocked!" hold run out, so its destination takes the screen. */
export async function finishGateHold() {
  if (vi.isFakeTimers()) await act(async () => vi.advanceTimersByTime(PARENT_GATE_SUCCESS_HOLD_MS));
  else await act(async () => new Promise((done) => setTimeout(done, PARENT_GATE_SUCCESS_HOLD_MS)));
}

export async function solveParentGate() {
  const { x, y } = gateProblem();
  await tapGateKeys(...[...String(x * y)].map(Number), 'Check answer');
  await finishGateHold();
}
