import { caller, records, host, mount, checkedRadio } from './rsd-native-selection-host.mjs';
import { orientationCalls } from './rsd-orientation-port.mjs';
import { act, createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';

// expo-screen-orientation's OrientationLock values and Android's
// ActivityInfo.SCREEN_ORIENTATION_SENSOR, spelled out so a remapped lock fails here.
const PORTRAIT_UP = 3;
const LANDSCAPE_RIGHT = 7;
const ANDROID_SENSOR = 4;
const AUTO_NOTE = "Auto follows your device's rotation setting.";
const VERSION_7 = {
  version: 7,
  soundEnabled: false,
  strokeWidth: 'thin',
  eraserWidth: 'thick',
  selectedColor: 'Purple',
  customColors: [],
  appearance: 'light',
  aiEnabled: false,
  parentPolicies: {
    ai: 'always',
    imageReport: 'always',
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: true,
};
const version8 = (orientation) => ({
  ...VERSION_7,
  version: 8,
  soundLevel: 'medium',
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation,
});

function openSettings(snapshot) {
  let stored = JSON.stringify(snapshot);
  const storage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      stored = next;
    }),
  };
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'marker',
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: true,
    colorPickerOpen: false,
  };
  caller.sound = { settings: { status: 'loading' }, owner: null, audioMessage: '' };
  caller.settingsStorage = storage;
  return { storage, stored: () => JSON.parse(stored) };
}
async function choose(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
  checkedRadio(host.querySelector(`[aria-label="${label}"]`));
}

it('locks an iPhone at startup and on each Settings choice, with Auto following the system', async () => {
  const settings = openSettings(VERSION_7);
  await mount(createElement(RsdDrawingScreen));
  checkedRadio(host.querySelector('[aria-label="Portrait orientation"]'));
  expect(host.textContent).toContain(AUTO_NOTE);
  expect(orientationCalls).toEqual([['lockAsync', PORTRAIT_UP]]);
  expect(settings.storage.write).not.toHaveBeenCalled();
  await choose('Landscape orientation');
  expect(orientationCalls.at(-1)).toEqual(['lockAsync', LANDSCAPE_RIGHT]);
  expect(settings.stored()).toMatchObject({ version: 8, orientation: 'landscape' });
  await choose('Auto orientation');
  expect(orientationCalls.at(-1)).toEqual(['unlockAsync']);
  expect(settings.stored().orientation).toBe('auto');
  await choose('Portrait orientation');
  expect(orientationCalls).toEqual([
    ['lockAsync', PORTRAIT_UP],
    ['lockAsync', LANDSCAPE_RIGHT],
    ['unlockAsync'],
    ['lockAsync', PORTRAIT_UP],
  ]);
  expect(settings.stored().orientation).toBe('portrait');
});

it('restores a saved Android Auto through the sensor request that beats the rotation lock', async () => {
  records.os = 'android';
  const settings = openSettings(version8('auto'));
  await mount(createElement(RsdDrawingScreen));
  checkedRadio(host.querySelector('[aria-label="Auto orientation"]'));
  expect(host.textContent).not.toContain(AUTO_NOTE);
  expect(orientationCalls).toEqual([
    ['lockPlatformAsync', { screenOrientationConstantAndroid: ANDROID_SENSOR }],
  ]);
  await choose('Portrait orientation');
  await choose('Landscape orientation');
  await choose('Auto orientation');
  expect(orientationCalls.slice(1)).toEqual([
    ['lockAsync', PORTRAIT_UP],
    ['lockAsync', LANDSCAPE_RIGHT],
    ['lockPlatformAsync', { screenOrientationConstantAndroid: ANDROID_SENSOR }],
  ]);
  expect(settings.stored().orientation).toBe('auto');
});

it('leaves a tablet to the OS: no picker and no lock request', async () => {
  records.dimensions = { width: 834, height: 1194, scale: 2, fontScale: 1 };
  openSettings(version8('landscape'));
  await mount(createElement(RsdDrawingScreen));
  checkedRadio(host.querySelector('[aria-label="Light appearance"]'));
  expect(host.querySelector('[aria-label="Orientation"]')).toBeNull();
  expect(host.textContent).not.toContain(AUTO_NOTE);
  expect(orientationCalls).toEqual([]);
});
