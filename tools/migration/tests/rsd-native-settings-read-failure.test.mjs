import { finishGateHold } from './rsd-parent-gate-keypad.mjs';
import { act, createElement, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { host, mount, records } from './rsd-native-selection-host.mjs';
import { nativeSettingsProps } from './rsd-coloring-root-host.mjs';
import { createDrawingProduct } from '../../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { NativeSoundSettingsDialog } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingsDialog.tsx';
import { RsdParentCenterSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdParentCenterSection.tsx';
import { soundSettingsActions } from '../../../experiments/native-architecture/src/rsdDrawing/soundSettingsActions.ts';

// A record a newer build wrote stays unread however often it is read again or saved over, so
// Settings and Parent Center show its update guidance alone; a store that did not answer keeps its
// retries. Negative control: an owner that calls every failure recoverable fails each newer case.
const FAILURES = [
  [
    'a newer record',
    async () => '{"version":17,"soundEnabled":true,"futurePreference":true}',
    'A newer version of Splotch saved these settings. Update Splotch to use them.',
    false,
  ],
  [
    'an unanswered read',
    async () => {
      throw new Error('permission denied');
    },
    'Drawing settings could not be read.',
    true,
  ],
  [
    'an unusable record',
    async () => '{"version":16,"soundEnabled":"true"}',
    'Saved drawing settings could not be used.',
    false,
  ],
];

// The dialog's text a sighted reader sees: everything but its spoken-only status region.
function visibleText() {
  const dialog = host.querySelector('[role="dialog"]').cloneNode(true);
  for (const status of dialog.querySelectorAll('[role="status"]')) status.remove();
  return dialog.textContent;
}

it.each(FAILURES)(
  'gives Settings a save retry after %s only where one can help',
  async (_, read, message, retried) => {
    let current;
    const owner = createSoundSettings({ read, write: async () => {} }, (state) => {
      current = state;
    });
    await owner.load();
    try {
      // The retry comes from the drawing screen's own wiring.
      const { onRetry } = soundSettingsActions({ owner: { settings: owner }, settings: current });
      await mount(
        createElement(NativeSoundSettingsDialog, {
          ...nativeSettingsProps(owner, current),
          onRetry,
        })
      );
      expect(visibleText()).toContain(message);
      const retry = host.querySelector('[aria-label="Try saving settings again"]');
      expect(retry !== null).toBe(retried);
    } finally {
      owner.dispose();
    }
  }
);

it.each(FAILURES)(
  'gives Parent Center its retries after %s only where one can help',
  async (_, read, message, retried) => {
    const storage = { read: vi.fn(read), write: vi.fn(async () => {}) };
    const owner = createDrawingProduct(storage, () => {});
    try {
      await owner.settings.load();
      await mount(
        createElement(
          DrawingAppearanceProvider,
          { preference: 'light' },
          createElement(RsdParentCenterSection, { owner })
        )
      );
      expect(host.textContent).toContain(message);
      const buttons = [...host.querySelectorAll('button')].map((node) => node.textContent);
      expect(buttons.includes('Read saved settings again')).toBe(retried);
      expect(buttons.includes('Retry saving Parent Center choices')).toBe(retried);
      expect(buttons.includes('Reset saved settings')).toBe(owner.settings.canResetSavedSettings());
      expect(storage.write).not.toHaveBeenCalled();
    } finally {
      owner.dispose();
    }
  }
);

it.each([402, 1024])(
  'keeps reset behind the Parent Center check and replaces unusable settings at width %s',
  async (width) => {
    records.dimensions = { width, height: 874, scale: 1, fontScale: 1 };
    let stored = '{"version":16,"soundEnabled":"true"}';
    const storage = {
      read: async () => stored,
      write: vi.fn(async (next) => {
        stored = next;
      }),
    };
    let refresh = () => {};
    const owner = createDrawingProduct(storage, () => refresh());
    try {
      await owner.settings.load();
      function Settings() {
        const [, update] = useState(0);
        refresh = () => update((value) => value + 1);
        const state = owner.getState();
        return createElement(NativeSoundSettingsDialog, {
          ...nativeSettingsProps(owner.settings, state.settings),
          ...soundSettingsActions({
            owner: { settings: owner.settings },
            settings: state.settings,
          }),
          parentCenter: {
            unlocked: state.parentCenterOpen,
            checkDue: state.parentCenterCheckDue,
            onUnlock: owner.openParentCenter,
            onLeave: owner.closeParentCenter,
            section: createElement(RsdParentCenterSection, { owner }),
          },
        });
      }
      await mount(createElement(Settings));
      const reset = () =>
        [...host.querySelectorAll('button')].find(
          (node) => node.textContent === 'Reset saved settings'
        );
      expect(reset()).toBeUndefined();
      await act(async () => owner.openParentCenter());
      expect(owner.getState().gate.open).toBe(true);
      expect(reset()).toBeUndefined();
      expect(storage.write).not.toHaveBeenCalled();
      await act(async () => {
        const { x, y } = owner.gate.getState();
        owner.gate.input(String(x * y));
        owner.gate.answer();
      });
      await finishGateHold();
      await act(async () => owner.gate.closed());
      expect(reset()).toBeDefined();
      expect(visibleText()).toContain(
        'Resetting replaces saved settings with their defaults. Your pictures are kept.'
      );
      await act(async () => reset().click());
      expect(storage.write).toHaveBeenCalledOnce();
      expect(JSON.parse(stored)).toMatchObject({
        version: 16,
        soundEnabled: true,
        aiEnabled: false,
      });
      expect(owner.getState().settings.saved).toBe(true);
      expect(reset()).toBeUndefined();
    } finally {
      owner.dispose();
    }
  }
);

it.each([402, 1024])(
  'shows one future-record warning in Parent Center at width %s',
  async (width) => {
    records.dimensions = { width, height: 874, scale: 1, fontScale: 1 };
    const storage = {
      read: async () => '{"version":17,"futurePreference":true}',
      write: vi.fn(async () => {}),
    };
    const owner = createDrawingProduct(storage, () => {});
    try {
      await owner.settings.load();
      const settings = owner.getState().settings;
      await mount(
        createElement(NativeSoundSettingsDialog, {
          ...nativeSettingsProps(owner.settings, settings),
          onRetry: null,
          parentCenter: {
            unlocked: true,
            checkDue: false,
            onUnlock() {},
            onLeave() {},
            section: createElement(RsdParentCenterSection, { owner }),
          },
        })
      );
      expect(visibleText().split(settings.message)).toHaveLength(2);
      expect(storage.write).not.toHaveBeenCalled();
    } finally {
      owner.dispose();
    }
  }
);

it.each([402, 1024])(
  'keeps the ordinary save retry in revealed Parent Center at width %s',
  async (width) => {
    records.dimensions = { width, height: 874, scale: 1, fontScale: 1 };
    let refuse = true;
    const storage = {
      read: async () => null,
      write: vi.fn(async () => {
        if (refuse) throw new Error('The settings store is unavailable.');
      }),
    };
    const owner = createDrawingProduct(storage, () => {});
    try {
      await owner.settings.load();
      const policies = owner.getState().settings.parentPolicies;
      await owner.settings.setEnabled(true);
      const settings = owner.getState().settings;
      expect(settings.saved).toBe(false);
      await mount(
        createElement(NativeSoundSettingsDialog, {
          ...nativeSettingsProps(owner.settings, settings),
          ...soundSettingsActions({ owner: { settings: owner.settings }, settings }),
          parentCenter: {
            unlocked: true,
            checkDue: false,
            onUnlock() {},
            onLeave() {},
            section: createElement(RsdParentCenterSection, { owner }),
          },
        })
      );
      expect(visibleText().split(settings.message)).toHaveLength(2);
      const retry = host.querySelector('[aria-label="Try saving settings again"]');
      expect(retry).not.toBeNull();
      refuse = false;
      await act(async () => retry.click());
      expect(storage.write).toHaveBeenCalledTimes(2);
      expect(owner.getState().settings).toMatchObject({
        saved: true,
        soundEnabled: true,
        parentPolicies: policies,
      });
    } finally {
      owner.dispose();
    }
  }
);
