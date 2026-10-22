import { records, host, mount, root, openSettingsSection } from './rsd-native-selection-host.mjs';
import './rsd-native-settings-hub-mocks.mjs';
import { click, drawingScreen, flat, storedSettings } from './rsd-native-settings-fixture.mjs';

import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { Animated } from 'react-native';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { RsdSectionReveal } from '../../../src/rsdDrawing/RsdSectionReveal.tsx';
import { ReduceMotionPreferenceProvider } from '../../../src/drawing/useReduceMotion.ts';
import { CALM_FADE_MS, SECTION_SLIDE_MS } from '../../../src/lib/motionDurations.ts';
import { TOOL_DRAWER_SPACING } from '../../../src/rsdDrawing/RsdToolDrawerSection.tsx';

function revealProps() {
  return records.props.findLast((props) => props.testID === 'settings-section-reveal');
}

function revealBody() {
  return records.props.findLast((props) => props.testID === 'settings-section-reveal-body');
}

async function showReveal(visible, preference = 'full') {
  const element = createElement(
    ReduceMotionPreferenceProvider,
    { preference },
    createElement(RsdSectionReveal, { visible, marginTop: 20, marginBottom: 2 }, 'Revealed setting')
  );
  if (root) await act(async () => root.render(element));
  else await mount(element);
}

async function measureReveal(height = 100) {
  await act(async () => revealBody().onLayout({ nativeEvent: { layout: { height } } }));
}

function holdReveals() {
  const pending = [];
  const nativeDriven = new WeakSet();
  const timing = vi.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (nativeDriven.has(value) && !config.useNativeDriver)
      throw new Error('Animated cannot run a JS animation after moving this value to native.');
    if (config.useNativeDriver) nativeDriven.add(value);
    const transition = { value, config, finish: null, stop: vi.fn() };
    pending.push(transition);
    return {
      start: (finish) => {
        transition.finish = finish;
      },
      stop: transition.stop,
    };
  });
  return { pending, timing };
}

it.each([
  ['Sound', { soundEnabled: true }],
  ['Tool Drawer', { applePencilSeen: true }],
])(
  'mounts both %s conditional blocks through the shipping section reveal',
  async (name, settings) => {
    storedSettings(settings);
    drawingScreen();
    await mount(createElement(RsdDrawingScreen));
    await openSettingsSection(name);
    expect(host.querySelectorAll('[data-testid="settings-section-reveal"]')).toHaveLength(2);
  }
);

it('keeps the Tool Drawer gap inside its clipped reveal', async () => {
  storedSettings();
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('Tool Drawer');
  const tools = records.props.findLast((props) => props.testID === 'tool-drawer-tools');
  expect(flat(tools.style ?? {}).marginTop).toBe(TOOL_DRAWER_SPACING.toolsTop);
});

it('mounts each AI Art alternative through its own shipping reveal', async () => {
  storedSettings({
    parentPolicies: {
      ai: 'never',
      imageReport: 'never',
      externalLinks: 'never',
      feedback: 'never',
      parentCenter: 'never',
    },
  });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  await openSettingsSection('AI Art');
  const count = () => host.querySelectorAll('[data-testid="settings-section-reveal"]').length;
  const off = count();
  expect(off).toBe(1);
  await click('Create AI Images');
  const on = count();
  expect(on).toBe(1);
});

it.each([
  ['full', SECTION_SLIDE_MS, false],
  ['reduce', CALM_FADE_MS, false],
])(
  'retains an exiting section for its shipping %s transition',
  async (preference, duration, driver) => {
    const { pending, timing } = holdReveals();
    try {
      await showReveal(true, preference);
      await measureReveal();
      expect(pending).toHaveLength(0);
      await showReveal(false, preference);
      expect(host.textContent).toContain('Revealed setting');
      expect(revealProps()).toMatchObject({
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      });
      expect(pending.map(({ config }) => config)).toEqual([
        expect.objectContaining({ toValue: 0, duration, useNativeDriver: driver }),
      ]);
      const style = flat(revealProps().style);
      expect(style.height !== undefined).toBe(preference === 'full');
      expect(style.overflow).toBe(preference === 'full' ? 'hidden' : 'visible');
      const interpolation = (outputRange) =>
        expect.objectContaining({
          interpolation: expect.objectContaining({ inputRange: [0, 1], outputRange }),
        });
      const full = {
        height: interpolation([0, 100]),
        marginTop: interpolation([0, 20]),
        marginBottom: interpolation([0, 2]),
        opacity: expect.objectContaining({
          interpolation: {
            inputRange: [0, 1 / 20, 1],
            outputRange: [0, 1, 1],
            extrapolate: 'clamp',
          },
        }),
      };
      const reduce = {
        height: undefined,
        marginTop: 20,
        marginBottom: 2,
        opacity: pending[0].value,
      };
      expect(style).toMatchObject({ full, reduce }[preference]);
      expect(revealBody().children.props.inert).toBe(true);
      await act(async () => pending[0].finish({ finished: true }));
      expect(host.textContent).not.toContain('Revealed setting');
    } finally {
      timing.mockRestore();
    }
  }
);

it('measures new content before its full reveal and releases the fixed height after landing', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(false);
    expect(host.textContent).not.toContain('Revealed setting');
    await showReveal(true);
    expect(pending).toHaveLength(0);
    expect(flat(revealProps().style).height).toBe(0);
    await measureReveal();
    expect(pending).toHaveLength(1);
    expect(pending[0].config).toMatchObject({
      toValue: 1,
      duration: SECTION_SLIDE_MS,
      useNativeDriver: false,
    });
    await act(async () => pending[0].finish({ finished: true }));
    expect(flat(revealProps().style).height).toBeUndefined();
    await measureReveal(240);
    expect(pending).toHaveLength(1);
    expect(flat(revealProps().style).height).toBeUndefined();
  } finally {
    timing.mockRestore();
  }
});

it.each([
  ['full', SECTION_SLIDE_MS],
  ['reduce', CALM_FADE_MS],
])(
  'reverses its %s transition over the remaining shipping distance',
  async (preference, duration) => {
    const { pending, timing } = holdReveals();
    try {
      await showReveal(true, preference);
      await measureReveal();
      await showReveal(false, preference);
      await act(async () => pending[0].value.setValue(0.25));
      await showReveal(true, preference);
      expect(pending[0].stop).toHaveBeenCalledOnce();
      expect(pending[1].config).toMatchObject({ toValue: 1, duration: duration * 0.75 });
      await act(async () => pending[0].finish({ finished: true }));
      expect(host.textContent).toContain('Revealed setting');
      expect(flat(revealProps().style).height).not.toBe(0);
      expect(pending[1].stop).not.toHaveBeenCalled();
      await act(async () => pending[1].finish({ finished: true }));
      expect(host.textContent).toContain('Revealed setting');
    } finally {
      timing.mockRestore();
    }
  }
);

it.each([
  ['full', 'reduce', SECTION_SLIDE_MS, CALM_FADE_MS],
  ['reduce', 'full', CALM_FADE_MS, SECTION_SLIDE_MS],
])(
  'keeps %s motion through a reversal before taking %s from rest',
  async (initial, next, currentDuration, nextDuration) => {
    const { pending, timing } = holdReveals();
    try {
      await showReveal(true, initial);
      await measureReveal();
      await showReveal(false, initial);
      await act(async () => pending[0].value.setValue(0.5));
      await showReveal(false, next);
      expect(pending).toHaveLength(1);
      await showReveal(true, next);
      expect(pending[1].config).toMatchObject({ toValue: 1, duration: currentDuration * 0.5 });
      expect(flat(revealProps().style).overflow).toBe(initial === 'full' ? 'hidden' : 'visible');
      await act(async () => pending[1].value.setValue(1));
      await act(async () => pending[1].finish({ finished: true }));
      await showReveal(false, next);
      expect(pending[2].config).toMatchObject({ toValue: 0, duration: nextDuration });
    } finally {
      timing.mockRestore();
    }
  }
);

it('finishes an unmeasured exit before taking the next motion preference', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(false);
    await showReveal(true);
    await showReveal(false, 'reduce');
    expect(host.textContent).not.toContain('Revealed setting');
    await showReveal(true, 'reduce');
    expect(pending).toHaveLength(1);
    expect(pending[0].config).toMatchObject({ toValue: 1, duration: CALM_FADE_MS });
  } finally {
    timing.mockRestore();
  }
});

it.each(['reverse', 'unmount'])(
  'ignores a deferred value read after %s cleanup',
  async (action) => {
    const callbacks = [];
    const stop = vi
      .spyOn(Animated.Value.prototype, 'stopAnimation')
      .mockImplementation(function (callback) {
        callbacks.push(() => callback?.(this.value));
      });
    const { pending, timing } = holdReveals();
    try {
      await showReveal(true);
      await measureReveal();
      await showReveal(false);
      expect(callbacks).toHaveLength(1);
      if (action === 'reverse') await showReveal(true);
      else await act(async () => root.unmount());
      await act(async () => callbacks[0]());
      expect(pending).toHaveLength(0);
      if (action === 'reverse') await act(async () => callbacks[1]());
      expect(pending).toHaveLength(action === 'reverse' ? 1 : 0);
    } finally {
      timing.mockRestore();
      stop.mockRestore();
    }
  }
);

it('keeps content after a canceled exit and stops its animation on unmount', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(true);
    await measureReveal();
    await showReveal(false);
    await act(async () => pending[0].finish({ finished: false }));
    expect(host.textContent).toContain('Revealed setting');
    await act(async () => root.unmount());
    expect(pending[0].stop).toHaveBeenCalledOnce();
  } finally {
    timing.mockRestore();
  }
});

it('can reveal with full motion after a completed calm exit on the same Animated value', async () => {
  const { pending, timing } = holdReveals();
  try {
    await showReveal(true, 'reduce');
    await measureReveal();
    await showReveal(false, 'reduce');
    await act(async () => pending[0].value.setValue(0));
    await act(async () => pending[0].finish({ finished: true }));
    expect(host.textContent).not.toContain('Revealed setting');
    await showReveal(true, 'full');
    await measureReveal();
    expect(pending.map(({ config }) => config.duration)).toEqual([CALM_FADE_MS, SECTION_SLIDE_MS]);
    expect(pending[0].value).toBe(pending[1].value);
    await act(async () => pending[1].finish({ finished: true }));
    expect(host.textContent).toContain('Revealed setting');
  } finally {
    timing.mockRestore();
  }
});
