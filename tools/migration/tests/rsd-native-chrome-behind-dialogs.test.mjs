import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { caller, records, root, host, expandControls } from './rsd-native-selection-host.mjs';
import { AI_BUTTON, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { adoptedDrawing } from '../../tests/native-paper-fixtures.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';

// Shipping's modal dialog leaves the drawing chrome behind it at full strength under the scrim's
// dim and blur, and inert: no press reaches it until the dialog has gone. Each dialog here is
// opened the way its owner opens it, so the screen's own dialog flag and the product route are
// both held.

// A closing dialog's exit runs on real timers here; the gate also holds its Unlocked! card.
const DIALOG_EXIT_WAIT_MS = PARENT_GATE_SUCCESS_HOLD_MS + 2000;
const LAYOUT = '[data-testid="rsd-drawing-layout"]';
const PAINT = 'Blue paint';
const DIALOGS = {
  Settings: {
    open: () => rerender({ dialogOpen: true, settingsOpen: true }),
    close: () => rerender({ dialogOpen: false, settingsOpen: false }),
  },
  'Color Picker': {
    open: () => rerender({ dialogOpen: true, colorPickerOpen: true }),
    close: () => rerender({ dialogOpen: false, colorPickerOpen: false }),
  },
  'Grown-Ups Only': {
    open: () => act(async () => caller.product.owner.openParentCenter()),
    close: () => act(async () => caller.product.owner.gate.dismiss()),
  },
};

function inked() {
  return {
    ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
    strokes: [{ brush: 'pen', width: 8, color: 'Purple', points: [{ x: 1, y: 1 }] }],
  };
}

async function rerender(overrides) {
  Object.assign(caller.screen, overrides);
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}

function chrome(label) {
  const node = host.querySelector(`${LAYOUT} [aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

// Every drawer tile and palette swatch as it shows: whether it is disabled, the opacity the
// native driver leaves on it, and the icon markup its colors are painted into.
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
    icon: node.querySelector('svg[data-xml]')?.dataset.xml,
  }));
}

function activateClear() {
  records.props
    .findLast((props) => props.accessibilityLabel === 'Clear drawing')
    .onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
}

async function pressEveryControl() {
  for (const label of [
    PAINT,
    'Brushes',
    'Stroke width',
    'Coloring books',
    'Save screenshot',
    AI_BUTTON,
    'Undo',
    'More colors',
    'Settings',
  ]) {
    await act(async () => chrome(label).click());
  }
  await act(async () => activateClear());
}

async function dialogsGone() {
  await vi.waitFor(() => expect(host.querySelector('[data-native-modal]')).toBeNull(), {
    timeout: DIALOG_EXIT_WAIT_MS,
  });
}

it.each(['buttons', 'bare'].flatMap((style) => Object.keys(DIALOGS).map((name) => [name, style])))(
  'keeps the chrome at full strength under the %s dialog in the %s style and drops every press',
  async (name, style) => {
    await mountToolbar(
      toolbarScreen({
        history: { undo: [emptyDrawing()], drawing: inked() },
        closeSettings: vi.fn(),
        closeColorPicker: vi.fn(),
      })
    );
    await act(async () => caller.product.sound.owner.settings.setToolbarStyle(style));
    await expandControls();
    const live = chromeLook();
    const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
    const startAi = vi.spyOn(caller.product.ai.owner, 'start').mockImplementation(() => {});

    await DIALOGS[name].open();
    expect(host.querySelector(`[data-native-modal="${name}"]`), name).not.toBeNull();
    expect(chromeLook()).toEqual(live);
    await pressEveryControl();
    expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
    for (const handler of ['setPagePickerOpen', 'save', 'undo', 'openColorPicker', 'clear'])
      expect(caller.screen[handler], handler).not.toHaveBeenCalled();
    expect(caller.screen.openSettings).not.toHaveBeenCalled();
    expect(setColor).not.toHaveBeenCalled();
    expect(startAi).not.toHaveBeenCalled();
    await act(async () => chrome('Collapse controls').click());
    expect(chrome('Collapse controls')).not.toBeNull();

    await DIALOGS[name].close();
    await dialogsGone();
    expect(chromeLook()).toEqual(live);
    await act(async () => chrome(PAINT).click());
    expect(setColor).toHaveBeenCalledExactlyOnceWith('Blue');
    await act(async () => chrome('Brushes').click());
    expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
    await act(async () => chrome('Brushes').click());
    for (const label of ['Coloring books', 'Save screenshot', 'Undo', 'More colors', 'Settings'])
      await act(async () => chrome(label).click());
    await act(async () => chrome(AI_BUTTON).click());
    await act(async () => activateClear());
    for (const handler of ['setPagePickerOpen', 'save', 'undo', 'openColorPicker', 'clear'])
      expect(caller.screen[handler], handler).toHaveBeenCalledOnce();
    expect(caller.screen.openSettings).toHaveBeenCalledOnce();
    expect(startAi).toHaveBeenCalledOnce();
  }
);
