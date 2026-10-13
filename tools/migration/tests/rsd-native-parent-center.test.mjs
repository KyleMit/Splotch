import { act, createElement, useEffect, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { host, mount, records, checkedSwitch } from './rsd-native-selection-host.mjs';
import { createDrawingProduct } from '../../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { RsdParentCenterSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentCenterSection.tsx';
import { RsdParentGateSheet } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentGateSheet.tsx';
import { RsdAction } from '../../../experiments/native-architecture/src/rsdDrawing/controls.tsx';

async function click(label) {
  const button = host.querySelector(`[aria-label="${label}"]`);
  expect(button, label).not.toBeNull();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
async function solve() {
  const match = host.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  const input = records.props.findLast((props) => props.accessibilityLabel === 'Grown-up answer');
  await act(async () =>
    input.onChange({ nativeEvent: { text: String(Number(match[1]) * Number(match[2])) } })
  );
  await click('Check answer');
}
it('mounts actual RSD shared gate, policy radio state, confirmation and persisted master controls', async () => {
  const storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
  let owner;
  function Product() {
    const [, update] = useState(0);
    const [instance] = useState(() =>
      createDrawingProduct(storage, () => update((value) => value + 1))
    );
    owner = instance;
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
      state.parentCenterOpen ? createElement(RsdParentCenterSection, { owner: instance }) : null,
      state.gate.open
        ? createElement(RsdParentGateSheet, { owner: instance, state: state.gate })
        : null
    );
  }
  await mount(createElement(Product));
  await click('Parent Center fixture entry');
  expect(storage.write).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Grown-ups only');
  await solve();
  const master = host.querySelector('[aria-label="AI picture creation"]');
  checkedSwitch(master, false);
  expect(
    records.props.findLast((props) => props.accessibilityLabel === 'AI picture creation')
      .accessibilityState.checked
  ).toBe(false);
  await click('AI picture creation');
  checkedSwitch(host.querySelector('[aria-label="AI picture creation"]'), true);
  expect(owner.port.consent().enabled).toBe(true);
  expect(JSON.parse(storage.write.mock.calls[0][0]).aiEnabled).toBe(true);
  expect(
    host.querySelector('[aria-label="Every time: Reporting an AI picture"]').dataset.checked
  ).toBe('true');
  await click('Per session: Reporting an AI picture');
  expect(owner.getState().settings.parentPolicies.imageReport).toBe('session');
  expect(JSON.parse(storage.write.mock.calls.at(-1)[0])).toMatchObject({
    version: 9,
    parentPolicies: { imageReport: 'session' },
  });
  await click('Never: Opening Parent Center');
  expect(owner.getState().settings.parentPolicies.parentCenter).toBe('always');
  expect(host.textContent).toContain('without a check on this device');
  await click('Confirm Parent Center Never');
  expect(owner.getState().settings.parentPolicies.parentCenter).toBe('never');
  await click('Keep drawing');
  await click('Parent Center fixture entry');
  expect(host.textContent).not.toContain('Grown-ups only');
});

it('rejects missing and incorrect native switch checked mappings', () => {
  const node = document.createElement('button');
  node.setAttribute('role', 'switch');
  expect(() => checkedSwitch(node, false)).toThrow('Missing native checked switch');
  node.dataset.checked = 'true';
  expect(() => checkedSwitch(node, false)).toThrow('Missing native checked switch');
  node.dataset.checked = 'false';
  expect(() => checkedSwitch(node, false)).not.toThrow();
  node.setAttribute('role', 'button');
  expect(() => checkedSwitch(node, false)).toThrow('Missing native checked switch');
});
