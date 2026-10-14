import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { caller, records, root, host, expandControls } from './rsd-native-selection-host.mjs';
import { AI_BUTTON, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { adoptedDrawing } from '../../tests/native-paper-fixtures.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';

// Shipping keeps its chrome live through a stroke. A touch cannot reach it then (the paper's
// responder keeps every touch until the lift), but a keyboard or assistive press can, so each
// opening owned outside the screen owner refuses itself until the lift, while a paint choice
// applies to the next contact. The screen owner's own openings and commands are held by
// native-stroke-chrome-mounted.test.mjs.

const PORTRAIT_PHONE = { width: 402, height: 874, scale: 1, fontScale: 1 };
const LANDSCAPE_PHONE = { width: 740, height: 360, scale: 1, fontScale: 1 };

afterEach(() => {
  records.dimensions = PORTRAIT_PHONE;
});

function inked() {
  return {
    ...adoptedDrawing({ width: 1024, height: 768, pixelRatio: 1 }),
    strokes: [{ brush: 'pen', width: 8, color: 'Purple', points: [{ x: 1, y: 1 }] }],
  };
}

function button(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  return node;
}

function activateClear() {
  records.props
    .findLast((props) => props.accessibilityLabel === 'Clear drawing')
    .onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
}

async function setDrawing(drawing) {
  caller.screen.drawing = drawing;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
}

it('leaves every chrome control enabled through a stroke and holds its openings until the lift', async () => {
  await mountToolbar(
    toolbarScreen({ drawing: true, history: { undo: [emptyDrawing()], drawing: inked() } })
  );
  await expandControls();
  const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
  const startAi = vi.spyOn(caller.product.ai.owner, 'start').mockImplementation(() => {});
  for (const label of ['Blue paint', 'Brushes', 'Stroke width', AI_BUTTON, 'Undo'])
    expect(button(label).disabled, label).toBe(false);
  expect(
    records.props.findLast((props) => props.accessibilityLabel === 'Clear drawing')
      .accessibilityState.disabled
  ).toBe(false);

  await act(async () => button('Brushes').click());
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  await act(async () => button('Stroke width').click());
  expect(host.querySelector('[aria-label="Stroke Width Menu"]')).toBeNull();
  await act(async () => button(AI_BUTTON).click());
  expect(startAi).not.toHaveBeenCalled();
  await act(async () => activateClear());
  expect(caller.screen.clear).not.toHaveBeenCalled();
  await act(async () => button('Blue paint').click());
  expect(setColor).toHaveBeenCalledExactlyOnceWith('Blue');

  await setDrawing(false);
  await act(async () => button('Brushes').click());
  expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
  await act(async () => button('Brushes').click());
  await act(async () => button('Stroke width').click());
  expect(host.querySelector('[aria-label="Stroke Width Menu"]')).not.toBeNull();
  await act(async () => button(AI_BUTTON).click());
  expect(startAi).toHaveBeenCalledTimes(1);
  await act(async () => activateClear());
  expect(caller.screen.clear).toHaveBeenCalledTimes(1);
});

it('keeps the landscape phone Color Menu shut through a stroke and lets it close at any time', async () => {
  records.dimensions = LANDSCAPE_PHONE;
  await mountToolbar(toolbarScreen({ drawing: true }));
  const colors = () => host.querySelector('[aria-label="Colors"][role="button"]');
  const menu = () => host.querySelector('[role="group"][aria-label="Colors"]');
  await act(async () => colors().click());
  expect(menu()).toBeNull();

  await setDrawing(false);
  await act(async () => colors().click());
  expect(menu()).not.toBeNull();
  await setDrawing(true);
  await act(async () => colors().click());
  expect(menu()).toBeNull();
});
