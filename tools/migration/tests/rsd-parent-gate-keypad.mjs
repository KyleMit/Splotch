import { act } from 'react';
import { expect } from 'vitest';
import { host } from './rsd-native-selection-host.mjs';

const GATE_MODAL = '[data-native-modal="Grown-ups only"]';

export function gateKey(key) {
  const modal = host.querySelector(GATE_MODAL);
  expect(modal, 'Grown-ups only gate').not.toBeNull();
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
  const match = host.querySelector(GATE_MODAL)?.textContent.match(/(\d) × (\d)/);
  expect(match, 'gate problem').not.toBeNull();
  return { x: Number(match[1]), y: Number(match[2]) };
}

export async function solveParentGate() {
  const { x, y } = gateProblem();
  await tapGateKeys(...[...String(x * y)].map(Number), 'Check answer');
}
