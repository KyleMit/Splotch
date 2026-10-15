import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caller, records, host, mount, expandControls } from './rsd-native-selection-host.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import { PNG_TIMEOUT_MS } from '../../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { saveFailureCopy } from '../../../web/src/lib/drawing/saveFailureCopy.ts';
import * as drawingFiles from '../../../experiments/native-architecture/src/platform/drawingFiles.ts';
import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { photos } from '../../tests/native-photo-library-port.mjs';

vi.mock('expo-media-library', () =>
  import('../../tests/native-photo-library-port.mjs').then((port) => port.mediaLibraryModule)
);
vi.mock('expo-file-system', () =>
  import('../../tests/native-photo-library-port.mjs').then((port) => port.fileSystemModule)
);
vi.mock('expo-file-system/legacy', () =>
  import('../../tests/native-photo-library-port.mjs').then((port) => port.legacyFilesModule)
);

const SCREEN_SETUP_BUDGET_MS = 2000;
const SAVE_TEST_TIMEOUT_MS = PNG_TIMEOUT_MS + SCREEN_SETUP_BUDGET_MS;
const EXPORTED_PNG = rgbaPng(4, 4, 255).toString('base64');
const INKED_PAPER = rgbaPng(1024, 768, 255).toString('base64');
const BLANK_PAPER = rgbaPng(1024, 768, 0).toString('base64');
const SETTINGS_V9 = (saveOnDeleteEnabled) =>
  JSON.stringify({
    version: 9,
    soundEnabled: false,
    strokeWidth: 'medium',
    eraserWidth: 'medium',
    selectedColor: 'Purple',
    customColors: [],
    appearance: 'system',
    aiEnabled: false,
    parentPolicies: {
      ai: 'always',
      imageReport: 'always',
      feedback: 'always',
      parentCenter: 'always',
    },
    coloringBookEnabled: true,
    soundLevel: 'medium',
    undoButtonEnabled: true,
    strokeWidthControlEnabled: true,
    orientation: 'portrait',
    saveOnDeleteEnabled,
  });

let privateWrite;
async function mountWith(settings) {
  caller.realScreen = true;
  caller.settingsStorage = { read: async () => settings, write: vi.fn(async () => {}) };
  await mount(createElement(RsdDrawingScreen));
}
async function click(label) {
  const node = host.querySelector(`[aria-label="${label}"]`);
  expect(node, label).not.toBeNull();
  await act(async () => node.click());
}
async function clear() {
  await act(async () =>
    records.props
      .findLast((props) => props.accessibilityLabel === 'Clear drawing')
      .onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
  );
}
async function save() {
  await expandControls();
  await click('Save screenshot');
}
async function settle(check) {
  await vi.waitFor(
    async () => {
      await act(async () => {});
      check();
    },
    { timeout: PNG_TIMEOUT_MS }
  );
}
const strokesOnPaper = () => caller.liveScreen.history.drawing.strokes.length;
beforeEach(() => {
  photos.reset();
  records.os = 'android';
  caller.exportPng = vi.fn(async () => EXPORTED_PNG);
  caller.captureInk = vi.fn(async () => INKED_PAPER);
  privateWrite = vi.spyOn(drawingFiles, 'savePicture');
});
afterEach(() => {
  caller.exportPng = null;
  caller.captureInk = null;
  vi.restoreAllMocks();
});
describe('canonical Save screenshot to Photos', () => {
  it(
    'adds the exported PNG to the photo library and keeps no copy inside the app',
    async () => {
      await mountWith(SETTINGS_V9(false));
      await click('Draw RSD fixture stroke');
      const drawing = caller.liveScreen.history.drawing;
      await save();
      await settle(() => expect(photos.created).toHaveLength(1));
      expect(privateWrite).not.toHaveBeenCalled();
      expect(caller.exportPng).toHaveBeenCalledWith(drawing);
      expect(photos.permissionRequests).toEqual([[true]]);
      expect(photos.created).toEqual([
        expect.objectContaining({ via: 'Album.create', album: 'Splotch', base64: EXPORTED_PNG }),
      ]);
      expect(host.textContent).not.toContain('saved');
    },
    SAVE_TEST_TIMEOUT_MS
  );
  it(
    'words a refused permission exactly as the shipping banner does',
    async () => {
      records.os = 'ios';
      photos.permission = 'denied';
      await mountWith(SETTINGS_V9(false));
      await click('Draw RSD fixture stroke');
      const drawing = caller.liveScreen.history.drawing;
      await save();
      const shipping = saveFailureCopy('denied', 1, 'ios');
      await settle(() => expect(host.textContent).toContain(shipping.detail));
      expect(host.textContent).toContain(shipping.heading);
      expect(host.textContent).not.toContain('Pictures');
      expect(privateWrite).not.toHaveBeenCalled();
      expect(caller.exportPng).toHaveBeenCalledWith(drawing);
      expect(photos.created).toEqual([]);
    },
    SAVE_TEST_TIMEOUT_MS
  );
});
describe('canonical Auto-Save on Delete', () => {
  it(
    'saves the picture before Clear wipes the paper',
    async () => {
      await mountWith(SETTINGS_V9(true));
      await click('Draw RSD fixture stroke');
      const drawing = caller.liveScreen.history.drawing;
      let strokesWhenSaved = null;
      photos.onCreate = () => {
        strokesWhenSaved = strokesOnPaper();
      };
      await clear();
      await settle(() => expect(photos.created).toHaveLength(1));
      expect(strokesOnPaper()).toBe(0);
      expect(strokesWhenSaved).toBe(1);
      expect(photos.created.map(({ base64 }) => base64)).toEqual([EXPORTED_PNG]);
      expect(caller.exportPng).toHaveBeenCalledWith(drawing);
      expect(privateWrite).not.toHaveBeenCalled();
      expect(host.textContent).not.toContain('saved');
    },
    SAVE_TEST_TIMEOUT_MS
  );
  it(
    'keeps the paper and reports the captured picture when Photos refuses it',
    async () => {
      photos.permission = 'denied';
      await mountWith(SETTINGS_V9(true));
      await click('Draw RSD fixture stroke');
      await clear();
      const shipping = saveFailureCopy('denied', 1, 'android');
      await settle(() => expect(host.textContent).toContain(shipping.detail));
      expect(strokesOnPaper()).toBe(1);
      expect(photos.created).toEqual([]);
    },
    SAVE_TEST_TIMEOUT_MS
  );
  it.each(['capture', 'photos'])(
    'keeps the paper after an Auto-Save on Delete %s failure and reports the failed save',
    async (failure) => {
      if (failure === 'capture')
        caller.exportPng.mockRejectedValueOnce(new Error('capture failed'));
      else photos.createError = new Error('Photos failed');
      await mountWith(SETTINGS_V9(true));
      await click('Draw RSD fixture stroke');
      await clear();
      const shipping = saveFailureCopy('failed', failure === 'capture' ? 0 : 1, 'android');
      await settle(() => expect(host.textContent).toContain(shipping.detail));
      expect(strokesOnPaper()).toBe(1);
    },
    SAVE_TEST_TIMEOUT_MS
  );
  it(
    'clears without saving when the setting is off',
    async () => {
      await mountWith(SETTINGS_V9(false));
      await click('Draw RSD fixture stroke');
      await clear();
      await settle(() => expect(strokesOnPaper()).toBe(0));
      expect(photos.created).toEqual([]);
      expect(privateWrite).not.toHaveBeenCalled();
      expect(caller.exportPng).not.toHaveBeenCalled();
    },
    SAVE_TEST_TIMEOUT_MS
  );
  it(
    'saves nothing for a page with no visible ink',
    async () => {
      caller.captureInk.mockResolvedValue(BLANK_PAPER);
      await mountWith(SETTINGS_V9(true));
      await click('Draw RSD fixture stroke');
      await act(async () => caller.liveScreen.setBrush('eraser'));
      await click('Draw RSD fixture stroke');
      await clear();
      await settle(() => expect(caller.liveScreen.history.drawing).toEqual(emptyDrawing(1)));
      expect(photos.created).toEqual([]);
      expect(privateWrite).not.toHaveBeenCalled();
    },
    SAVE_TEST_TIMEOUT_MS
  );
});
