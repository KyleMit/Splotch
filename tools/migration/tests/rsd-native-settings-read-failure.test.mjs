import { createElement } from 'react';
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
      expect(storage.write).not.toHaveBeenCalled();
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
