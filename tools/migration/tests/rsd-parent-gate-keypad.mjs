import { act } from 'react';
import { expect, vi } from 'vitest';
import { host, records } from './rsd-native-selection-host.mjs';
import { PARENT_GATE_METRICS } from '../../../experiments/native-architecture/src/parentCenter/parentGateMetrics.ts';
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

export function expectGateEquation(label) {
  const images = [...host.querySelectorAll(`${GATE_MODAL} [role="img"]`)];
  expect(images).toHaveLength(1);
  expect(images[0].getAttribute('aria-label')).toBe(label);
  expect(records.props.findLast((props) => props.role === 'img')).toMatchObject({
    accessible: true,
    role: 'img',
    accessibilityLabel: label,
  });
}

export function expectGateEquationGeometry() {
  const image = host.querySelector(`${GATE_MODAL} [role="img"]`);
  const props = JSON.parse(image.getAttribute('data-committed-props'));
  expect(image.textContent).toBe('6×6=');
  expect(props.style).toEqual({
    position: 'static',
    boxSizing: 'content-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: PARENT_GATE_METRICS.phone.equationGap,
    alignContent: 'stretch',
    flexBasis: 'auto',
    flexShrink: 1,
    flexWrap: 'nowrap',
  });
  const decorations = [...image.children].map((node) =>
    JSON.parse(node.getAttribute('data-committed-props'))
  );
  expect(
    decorations.map((props) => [props.accessibilityElementsHidden, props.importantForAccessibility])
  ).toEqual(Array.from({ length: image.children.length }, () => [true, 'no-hide-descendants']));
  expect(image.children).toHaveLength(4);
}
