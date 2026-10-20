import { act, createElement, useEffect, useState } from 'react';
import { expect, vi } from 'vitest';
import { host, mount } from './rsd-native-selection-host.mjs';
import { solveParentGate } from './rsd-parent-gate-keypad.mjs';
import { createDrawingProduct } from '../../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdParentCenterSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentCenterSection.tsx';
import { useModalPresence } from '../../../experiments/native-architecture/src/rsdDrawing/useModalPresence.ts';
import { RsdParentGateSheet } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateSheet.tsx';
import { RsdAction } from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';
import { useParentGateCard } from '../../../experiments/native-architecture/src/parentCenter/useParentGateCard.ts';
import {
  PARENT_LABELS,
  PARENT_MODE_LABELS,
} from '../../../experiments/native-architecture/src/parentCenter/parentCenterCopy.ts';

// The Parent Center section mounted beside a real product owner and its grown-up check, and the
// queries the Parent Center suites share.
export const SECTION = '[data-testid="parent-center-fixture"]';

export async function click(label) {
  const button = host.querySelector(`[aria-label="${label}"]`);
  expect(button, label).not.toBeNull();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
export async function clickText(text) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button.click());
}
export const policyGroup = (feature) =>
  host.querySelector(`[aria-label="${PARENT_LABELS[feature]} parental gate frequency"]`);
export const policyOption = (feature, mode) =>
  policyGroup(feature).querySelector(`[aria-label="${PARENT_MODE_LABELS[mode]}"]`);
// A stacked card: its heading's copy block, then the picker and any note beside it.
const policyCard = (feature) =>
  [...host.querySelectorAll(`${SECTION} [role="heading"]`)].find(
    (node) => node.textContent === PARENT_LABELS[feature]
  ).parentElement.parentElement;
export const policyNote = (feature) => policyCard(feature).querySelector('[role="note"]');
export async function choose(feature, mode) {
  await act(async () => policyOption(feature, mode).click());
}

function GateFixture({ owner }) {
  const view = useParentGateCard(owner.getState().gate);
  const presence = useModalPresence(view?.open ? view : null);
  return presence.shown
    ? createElement(RsdParentGateSheet, {
        owner,
        state: presence.shown.state,
        unlocked: presence.shown.unlocked,
        visible: presence.visible,
        onDismiss: presence.dismissed,
      })
    : null;
}
function ProductFixture({ storage, onOwner }) {
  const [, update] = useState(0);
  const [instance] = useState(() =>
    createDrawingProduct(storage, () => update((value) => value + 1))
  );
  onOwner(instance);
  useEffect(() => {
    void instance.settings.load();
    return instance.dispose;
  }, [instance]);
  const state = instance.getState();
  return createElement(
    DrawingAppearanceProvider,
    { preference: 'dark' },
    createElement(RsdAction, {
      label: 'Parent Center fixture entry',
      onClick: instance.openParentCenter,
    }),
    state.parentCenterOpen
      ? createElement(
          'div',
          { 'data-testid': 'parent-center-fixture' },
          createElement(RsdParentCenterSection, { owner: instance })
        )
      : null,
    createElement(GateFixture, { owner: instance })
  );
}
export async function mountProduct(
  storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) }
) {
  let owner;
  await mount(
    createElement(ProductFixture, { storage, onOwner: (instance) => (owner = instance) })
  );
  return owner;
}
export async function openParentCenter(storage) {
  const owner = await mountProduct(storage);
  await click('Parent Center fixture entry');
  await solveParentGate();
  expect(host.querySelector(SECTION)).not.toBeNull();
  return owner;
}
