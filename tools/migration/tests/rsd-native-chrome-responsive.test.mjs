import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { caller, host, expandControls } from './rsd-native-selection-host.mjs';
import { mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { STROKE_WIDTHS } from '../../../src/drawing/strokeWidth.ts';

// Shipping's toolbar has no disabled state for routine work: its settings are written
// synchronously, so nothing greys while a choice saves.

const LAYOUT = '[data-testid="rsd-drawing-layout"]';

function chrome(label) {
  const node = host.querySelector(`${LAYOUT} [aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

// Every drawer tile and palette swatch as it shows: whether it is disabled and the opacity the
// native driver leaves on it.
function chromeLook() {
  const controls = [
    ...host.querySelectorAll(`${LAYOUT} [data-testid="rsd-drawer-tool"] button`),
    ...host.querySelectorAll(`${LAYOUT} [data-testid="rsd-palette-plate"] button`),
  ];
  expect(controls.length).toBeGreaterThan(0);
  return controls.map((node) => ({
    label: node.getAttribute('aria-label'),
    disabled: node.disabled,
    opacity: node.dataset.shownOpacity,
  }));
}

function holdWrites() {
  const writes = [];
  caller.settingsStorage = {
    read: async () => caller.initialSettings,
    write: vi.fn(
      () =>
        new Promise((resolve) => {
          writes.push(resolve);
        })
    ),
  };
  return () => act(async () => writes.shift()?.());
}

it('keeps the toolbar at full strength and live while a width choice writes', async () => {
  const finish = holdWrites();
  await mountToolbar(toolbarScreen());
  await expandControls();
  const live = chromeLook();
  await act(async () => chrome('Stroke width').click());
  await act(async () => chrome('Size 1').click());
  expect(caller.settingsStorage.write).toHaveBeenCalledOnce();
  expect(chromeLook()).toEqual(live);
  await act(async () => chrome('Stroke width').click());
  await act(async () => chrome('Size 5').click());
  expect(caller.product.sound.settings.strokeWidth).toBe(STROKE_WIDTHS[4]);
  await finish();
  await finish();
  expect(caller.settingsStorage.write).toHaveBeenCalledTimes(2);
  expect(JSON.parse(caller.settingsStorage.write.mock.calls[1][0]).strokeWidth).toBe(
    STROKE_WIDTHS[4]
  );
});
