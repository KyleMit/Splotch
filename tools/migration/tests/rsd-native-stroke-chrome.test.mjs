import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { caller, records, root, host, expandControls } from './rsd-native-selection-host.mjs';
import { AI_BUTTON, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { adoptedDrawing } from '../../tests/native-paper-fixtures.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { Animated } from '../../../experiments/native-architecture/src/platform/animated.ts';
import { FLYOUT_EXIT_MS } from '../../../web/src/lib/motionDurations.ts';

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
  for (const label of ['Blue', 'Brushes', 'Stroke width', AI_BUTTON, 'Undo'])
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
  await act(async () => button('Blue').click());
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

it('defers actual drawing-audio failure and recovery banners until the stroke lifts', async () => {
  const loads = [];
  caller.drawingLoop = () => new Promise((resolve, reject) => loads.push({ resolve, reject }));
  try {
    await mountToolbar(toolbarScreen(), { soundEnabled: true });
    const audio = caller.product.sound.owner.audio;
    await setDrawing(true);
    await act(async () => audio.begin({ x: 10, y: 20 }, 100));
    await act(async () => loads[0].reject(new Error('Audio load failed')));
    expect(host.textContent).not.toContain('Drawing sound is unavailable');
    await setDrawing(false);
    expect(host.textContent).toContain('Drawing sound is unavailable');
    await setDrawing(true);
    await act(async () => audio.begin({ x: 10, y: 20 }, 200));
    await act(async () =>
      loads[1].resolve({ start() {}, stop() {}, setVolume() {}, dispose() {} })
    );
    await act(async () => audio.sample({ x: 60, y: 20 }, 300));
    expect(host.textContent).toContain('Drawing sound is unavailable');
    await setDrawing(false);
    expect(host.textContent).not.toContain('Drawing sound is unavailable');
  } finally {
    caller.drawingLoop = null;
  }
});

it("retains a closing Brush Menu inert until shipping's exit completes", async () => {
  await mountToolbar(toolbarScreen());
  await expandControls();
  await act(async () => button('Brushes').click());
  const original = Animated.timing;
  let finish;
  const timing = vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (config.duration !== FLYOUT_EXIT_MS || config.toValue !== 0) return original(value, config);
    return {
      start(done) {
        finish = done;
      },
      stop() {},
    };
  });
  await act(async () => button('Brushes').click());
  expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
  expect(
    records.props.findLast((props) => props.testID === 'rsd-flyout-motion').pointerEvents
  ).toBe('none');
  const wrapper = records.props.findLast((props) => props.testID === 'rsd-tool-flyout');
  expect(wrapper.pointerEvents).toBe('none');
  expect(wrapper.onStartShouldSetResponderCapture).toBeUndefined();
  expect(
    records.props
      .findLast((props) => props.testID === 'rsd-drawing-layout')
      .onStartShouldSetResponderCapture()
  ).toBe(false);
  expect(finish).toBeTypeOf('function');
  await act(async () => finish({ finished: true }));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  timing.mockRestore();
});

it('retires an interrupted drawer cascade when a stroke begins', async () => {
  await mountToolbar(toolbarScreen());
  const original = Animated.timing;
  const timing = vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (typeof config.delay !== 'number') return original(value, config);
    return { start() {}, stop() {} };
  });
  await expandControls();
  const scheduled = () =>
    timing.mock.calls
      .map(([, config]) => config)
      .filter((config) => typeof config.delay === 'number');
  const first = scheduled().length;
  expect(first).toBeGreaterThan(0);
  await setDrawing(true);
  await setDrawing(false);
  expect(scheduled()).toHaveLength(first);
  timing.mockRestore();
});

it("blooms only the chosen paint on shipping's main and trail clocks", async () => {
  await mountToolbar(toolbarScreen());
  const timing = vi.spyOn(Animated, 'timing');
  timing.mockClear();
  const paint = host.querySelectorAll(
    '[role="radiogroup"][aria-label="Paint colors"] [role="radio"]'
  )[1];
  await act(async () => paint.click());
  expect(
    records.props.findLast((props) => props.accessibilityLabel === paint.getAttribute('aria-label'))
      .accessibilityState.checked
  ).toBe(true);
  const clocks = () =>
    timing.mock.calls
      .map(([, config]) => config)
      .filter((config) => [620, 700].includes(config.duration));
  expect(clocks().map((config) => [config.duration, config.delay])).toEqual([
    [620, undefined],
    [620, undefined],
    [700, 90],
    [700, 90],
  ]);
  await act(async () => paint.click());
  expect(clocks()).toHaveLength(4);
  timing.mockRestore();
});

it('opens landscape-phone flyouts horizontally from the trigger edge', async () => {
  records.dimensions = LANDSCAPE_PHONE;
  await mountToolbar(toolbarScreen());
  await expandControls();
  await act(async () => button('Brushes').click());
  const motion = records.props.findLast((props) => props.testID === 'rsd-flyout-motion');
  expect(motion.style.transformOrigin).toEqual([0, '100%', 0]);
  expect(motion.style.transform[0].translateX).not.toBe(0);
});
