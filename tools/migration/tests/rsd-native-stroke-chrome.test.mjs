import { act, createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  caller,
  records,
  root,
  host,
  mount,
  expandControls,
} from './rsd-native-selection-host.mjs';
import { AI_BUTTON, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { adoptedDrawing, canonicalPaper } from '../../tests/native-paper-fixtures.mjs';
import { emptyDrawing } from '../../../src/drawing/model.ts';
import { Animated } from '../../../src/platform/animated.ts';
import { FLYOUT_EXIT_MS } from '../../../src/lib/motionDurations.ts';

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

it('opens a flyout from a second native touch while paper holds the first, once on an inside release', async () => {
  await mountToolbar(toolbarScreen({ drawing: true }));
  await expandControls();
  const trigger = button('Brushes');
  trigger.measureInWindow = (done) => done(0, 0, 60, 60);
  const props = () =>
    records.props.findLast((candidate) => candidate.accessibilityLabel === 'Brushes');
  const paper = { identifier: 1, pageX: 100, pageY: 100, timestamp: 50 };
  const event = (x, timestamp, lifted = false) => {
    const changed = { identifier: 2, pageX: x, pageY: 30, timestamp };
    return {
      persist() {},
      nativeEvent: {
        ...changed,
        touches: lifted ? [paper] : [paper, changed],
        changedTouches: [changed],
      },
    };
  };
  await act(async () => props().onTouchStart?.(event(30, 100)));
  await act(async () => props().onTouchMove?.(event(90, 120)));
  await act(async () => props().onTouchEnd?.(event(90, 140, true)));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  await act(async () => props().onTouchStart?.(event(30, 200)));
  trigger.measureInWindow = (done) => done(100, 100, 60, 60);
  await act(async () => props().onTouchEnd?.(event(30, 240, true)));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  trigger.measureInWindow = (done) => done(0, 0, 60, 60);
  await act(async () => props().onTouchStart?.(event(30, 300)));
  const released = event(30, 340, true);
  await act(async () => props().onTouchEnd?.(released));
  await act(async () => props().onPress?.(released));
  expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
  expect(caller.screen.drawing).toBe(true);
});

it.each([false, true])(
  'deduplicates routed chrome delivery with a raw press targeting the secondary contact: %s',
  async (rawPress) => {
    await mountToolbar(toolbarScreen({ drawing: true }));
    await expandControls();
    const trigger = button('Brushes');
    trigger.getBoundingClientRect = () => ({ x: 0, y: 0, width: 60, height: 60 });
    trigger.measureInWindow = (done) => done(0, 0, 60, 60);
    const brush = () => records.props.findLast((props) => props.accessibilityLabel === 'Brushes');
    const layout = () => records.props.findLast((props) => props.testID === 'rsd-drawing-layout');
    const paper = { identifier: 1, pageX: 100, pageY: 100, timestamp: 50 };
    const event = (timestamp, lifted = false, raw = false) => {
      const chrome = { identifier: 2, pageX: 30, pageY: 30, timestamp };
      return {
        persist() {},
        nativeEvent: {
          ...(raw ? chrome : paper),
          touches: lifted ? [paper] : [paper, chrome],
          changedTouches: [chrome],
        },
      };
    };
    await act(async () => layout().onStartShouldSetResponderCapture?.(event(100)));
    await act(async () => brush().onTouchStart?.(event(100, false, true)));
    await act(async () => layout().onTouchEnd?.(event(140, true)));
    expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
    await act(async () => brush().onTouchEnd?.(event(140, true, true)));
    await act(async () => brush().onPress?.(event(140, true, rawPress)));
    expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
    expect(caller.screen.drawing).toBe(true);
  }
);

it('routes the secondary Clear drag and commits once when raw delivery repeats it', async () => {
  const finishInput = vi.fn();
  await mountToolbar(toolbarScreen({ drawing: true, finishInput }));
  const clear = () =>
    records.props.findLast((props) => props.accessibilityLabel === 'Clear drawing');
  const layout = () => records.props.findLast((props) => props.testID === 'rsd-drawing-layout');
  host.querySelector('[aria-label="Clear drawing"]').getBoundingClientRect = () => ({
    x: 350,
    y: 88,
    width: 64,
    height: 64,
  });
  const paper = { identifier: 1, pageX: 100, pageY: 400, timestamp: 50 };
  const packet = (point, lifted = false, raw = false) => {
    const chrome = { identifier: 2, timestamp: 100, ...point };
    return {
      nativeEvent: {
        ...(raw ? chrome : paper),
        touches: lifted ? [paper] : [paper, chrome],
        changedTouches: [chrome],
      },
    };
  };
  const start = { pageX: 382, pageY: 120 };
  const moved = { pageX: 100, pageY: 400 };
  await act(async () => layout().onStartShouldSetResponderCapture(packet(start)));
  expect(finishInput).toHaveBeenCalledTimes(1);
  await act(async () => clear().onTouchStart(packet(start, false, true)));
  expect(finishInput).toHaveBeenCalledTimes(1);
  await act(async () => layout().onTouchMove(packet(moved)));
  await act(async () => clear().onTouchMove(packet(moved, false, true)));
  await act(async () => layout().onTouchEnd(packet(moved, true)));
  await act(async () => clear().onTouchEnd(packet(moved, true, true)));
  expect(caller.screen.clear).toHaveBeenCalledTimes(1);
});

it('cancels paper-routed chrome presses on moved bounds, slide-out, cancellation and disabling', async () => {
  await mountToolbar(toolbarScreen({ drawing: true }));
  await expandControls();
  const trigger = button('Brushes');
  let frame = { x: 0, y: 0, width: 60, height: 60 };
  trigger.getBoundingClientRect = () => frame;
  trigger.measureInWindow = (done) => done(frame.x, frame.y, frame.width, frame.height);
  const layout = () => records.props.findLast((props) => props.testID === 'rsd-drawing-layout');
  const packet = (x, timestamp, lifted = false) => {
    const paper = { identifier: 1, pageX: 100, pageY: 100, timestamp: 50 };
    const chrome = { identifier: 2, pageX: x, pageY: 30, timestamp };
    return {
      persist() {},
      nativeEvent: {
        ...paper,
        touches: lifted ? [paper] : [paper, chrome],
        changedTouches: [chrome],
      },
    };
  };
  await act(async () => layout().onStartShouldSetResponderCapture?.(packet(30, 100)));
  await act(async () => layout().onTouchMove?.(packet(90, 120)));
  await act(async () => layout().onTouchEnd?.(packet(90, 140, true)));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  await act(async () => layout().onStartShouldSetResponderCapture?.(packet(30, 200)));
  frame = { x: 100, y: 100, width: 60, height: 60 };
  await act(async () => layout().onTouchEnd?.(packet(30, 240, true)));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  frame = { x: 0, y: 0, width: 60, height: 60 };
  await act(async () => layout().onStartShouldSetResponderCapture?.(packet(30, 300)));
  await act(async () => layout().onTouchCancel?.(packet(30, 320)));
  await act(async () => layout().onTouchEnd?.(packet(30, 340, true)));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
  await act(async () => layout().onStartShouldSetResponderCapture?.(packet(30, 400)));
  caller.screen.disabled = true;
  await act(async () => root.render(createElement(RsdDrawingScreen)));
  await act(async () => layout().onTouchEnd?.(packet(30, 440, true)));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
});

it('ignores a departed layout release instead of changing its paint choice', async () => {
  const finishInput = vi.fn();
  await mountToolbar(toolbarScreen({ drawing: true, finishInput }));
  const paint = button('Blue');
  paint.getBoundingClientRect = () => ({ x: 0, y: 0, width: 60, height: 60 });
  paint.measureInWindow = (done) => done(0, 0, 60, 60);
  const choose = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
  const layout = records.props.findLast((props) => props.testID === 'rsd-drawing-layout');
  const paper = { identifier: 1, pageX: 100, pageY: 100, timestamp: 50 };
  const chrome = { identifier: 2, pageX: 30, pageY: 30, timestamp: 100 };
  const event = (lifted) => ({
    persist() {},
    nativeEvent: {
      ...paper,
      touches: lifted ? [paper] : [paper, chrome],
      changedTouches: [chrome],
    },
  });
  await act(async () => layout.onStartShouldSetResponderCapture?.(event(false)));
  expect(finishInput).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  await act(async () => layout.onTouchEnd?.(event(true)));
  expect(choose).not.toHaveBeenCalled();
});

it('finishes held ink on palette press-down even when the paint press is cancelled', async () => {
  const finishInput = vi.fn();
  await mountToolbar(toolbarScreen({ drawing: true, finishInput }));
  const setColor = vi.spyOn(caller.product.sound.owner.settings, 'setColor');
  const blue = records.props.findLast((props) => props.accessibilityLabel === 'Blue');
  await act(async () => blue.onPressIn?.());
  expect(finishInput).toHaveBeenCalledTimes(1);
  await act(async () => blue.onPressOut?.());
  expect(setColor).not.toHaveBeenCalled();
  const more = records.props.findLast((props) => props.accessibilityLabel === 'Custom Color');
  await act(async () => more.onPressIn?.());
  expect(finishInput).toHaveBeenCalledTimes(2);
  await act(async () => more.onPressOut?.());
});

it('keeps flyouts, palette and Clear live during a stroke while AI waits for the lift', async () => {
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
  expect(host.querySelector('[aria-label="Brush Menu"]')).not.toBeNull();
  await act(async () => button('Stroke width').click());
  expect(host.querySelector('[aria-label="Stroke Width Menu"]')).not.toBeNull();
  await act(async () => button(AI_BUTTON).click());
  expect(startAi).not.toHaveBeenCalled();
  await act(async () => activateClear());
  expect(caller.screen.clear).toHaveBeenCalledTimes(1);
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
  expect(caller.screen.clear).toHaveBeenCalledTimes(1);
});

it('finishes held ink when the landscape phone Color Menu toggles and lets it close at any time', async () => {
  records.dimensions = LANDSCAPE_PHONE;
  const finishInput = vi.fn();
  await mountToolbar(toolbarScreen({ drawing: true, finishInput }));
  const colors = () => host.querySelector('[aria-label="Colors"][role="button"]');
  const menu = () => host.querySelector('[role="group"][aria-label="Colors"]');
  await act(async () => colors().click());
  expect(finishInput).toHaveBeenCalledTimes(1);
  expect(menu()).not.toBeNull();

  await setDrawing(false);
  await act(async () => colors().click());
  expect(menu()).toBeNull();
  await setDrawing(true);
  await act(async () => colors().click());
  expect(menu()).not.toBeNull();
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

it('uses current history for native Undo in the same event as the first committed cohort', async () => {
  caller.realScreen = true;
  caller.settingsStorage = {
    read: async () => '{"version":1,"soundEnabled":false}',
    write: async () => {},
  };
  await mount(createElement(RsdDrawingScreen));
  expect(caller.liveScreen.history.undo).toHaveLength(0);
  const receiver = records.props.findLast((props) => props.testID === 'drawing-keyboard-scope');
  expect(receiver).toBeDefined();
  await act(async () => {
    caller.liveScreen.recovery.callbacks.onCohort(
      [{ brush: 'pen', color: 'Red', width: 8, points: [{ x: 20, y: 20 }] }],
      canonicalPaper()
    );
    receiver.onShortcutKey({ nativeEvent: { key: 'undo' } });
  });
  expect(caller.paper.strokes).toHaveLength(0);
});

it('routes native Undo to committed drawing history and refuses it under Settings', async () => {
  caller.realScreen = true;
  caller.settingsStorage = {
    read: async () => '{"version":1,"soundEnabled":false}',
    write: async () => {},
  };
  await mount(createElement(RsdDrawingScreen));
  await act(async () => button('Draw RSD fixture stroke').click());
  await act(async () => button('Draw RSD fixture stroke').click());
  const receiver = () =>
    records.props.findLast((props) => props.testID === 'drawing-keyboard-scope');
  expect(receiver()).toBeDefined();
  button('Settings').focus();
  expect(document.activeElement).toBe(button('Settings'));
  await act(async () => caller.liveScreen.recovery.callbacks.onDrawingChange(true));
  await act(async () => receiver().onShortcutKey({ nativeEvent: { key: 'undo' } }));
  expect(caller.paper.strokes).toHaveLength(1);
  await act(async () => caller.liveScreen.recovery.callbacks.onDrawingChange(false));
  await act(async () => button('Settings').click());
  await act(async () => receiver().onShortcutKey({ nativeEvent: { key: 'undo' } }));
  expect(caller.paper.strokes).toHaveLength(1);
});

it('routes native Escape while a flyout option holds focus', async () => {
  await mountToolbar(toolbarScreen({ brush: 'pen' }));
  await expandControls();
  await act(async () => button('Brushes').click());
  const option = host.querySelector('[aria-label="Brush Menu"] button[aria-label="Pen"]');
  expect(option).not.toBeNull();
  expect(option.dataset.selected).toBe('true');
  option.focus();
  expect(document.activeElement).toBe(option);
  const receiver = records.props.findLast((props) => props.testID === 'drawing-keyboard-scope');
  await act(async () => receiver.onShortcutKey({ nativeEvent: { key: 'escape' } }));
  expect(host.querySelector('[aria-label="Brush Menu"]')).toBeNull();
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
  const paper = { identifier: 1, pageX: 200, pageY: 200, timestamp: 100 };
  expect(
    records.props
      .findLast((props) => props.testID === 'rsd-drawing-layout')
      .onStartShouldSetResponderCapture({
        nativeEvent: { touches: [paper], changedTouches: [paper] },
      })
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
  const paint = host.querySelectorAll('[data-testid="rsd-palette-paints"] button')[1];
  await act(async () => paint.click());
  expect(
    records.props.findLast((props) => props.accessibilityLabel === paint.getAttribute('aria-label'))
      .accessibilityState.checked
  ).toBeUndefined();
  expect(caller.sound.settings.activeSwatch).toBe(paint.getAttribute('aria-label'));
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
