// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as drawingModel from '../../experiments/native-architecture/src/drawing/model.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { createScreen, files, pictures, STROKE } from './native-drawing-screen-harness.mjs';
import { photos } from './native-photo-library-port.mjs';

vi.mock('expo-media-library', () =>
  import('./native-photo-library-port.mjs').then((port) => port.mediaLibraryModule)
);
vi.mock('expo-file-system', () =>
  import('./native-photo-library-port.mjs').then((port) => port.fileSystemModule)
);
vi.mock('expo-file-system/legacy', () =>
  import('./native-photo-library-port.mjs').then((port) => port.legacyFilesModule)
);

const SCREEN_SETUP_BUDGET_MS = 2000;
const SAVE_CLEAR_TEST_TIMEOUT_MS = PNG_TIMEOUT_MS + SCREEN_SETUP_BUDGET_MS;
const EXPORTED_PNG = rgbaPng(4, 4, 255).toString('base64');
let screen;
let clear;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReset().mockReturnValue(pictures);
  files.save.mockReset().mockResolvedValue({ id: 'picture-1-fixture' });
  files.open.mockReset();
  files.capture.mockReset().mockResolvedValue(EXPORTED_PNG);
  photos.reset();
  files.ink.mockReset().mockResolvedValue(rgbaPng(1024, 768, 255).toString('base64'));
  files.export.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  files.brushRead.mockReset().mockResolvedValue(null);
  files.brushWrite.mockReset().mockResolvedValue(undefined);
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.platform = 'android';
  files.scheme = 'light';
  files.retainClosingModal = false;
  clear = vi.spyOn(drawingModel, 'clearDrawing');
  screen = createScreen();
  await screen.mount();
});

afterEach(() => {
  screen?.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function drawPicture() {
  await screen.click('Draw fixture stroke');
  return screen.paper();
}

function deferSave() {
  let finish;
  files.save.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  return () => act(async () => finish({ id: 'picture-1-fixture' }));
}

async function expectSaveStarted() {
  await vi.waitFor(
    async () => {
      await act(async () => {});
      expect(files.save).toHaveBeenCalledOnce();
    },
    { timeout: PNG_TIMEOUT_MS }
  );
}

describe('Save and clear through Drawing tools', () => {
  it(
    'waits for the editable snapshot save before clearing and restores it with Undo',
    async () => {
      const original = await drawPicture();
      const finish = deferSave();
      await screen.menuClick('Save and clear');
      await expectSaveStarted();
      expect(files.save).toHaveBeenCalledWith(JSON.parse(original));
      expect(clear).not.toHaveBeenCalled();
      expect(screen.paper()).toBe(original);
      expect(screen.button('Draw fixture stroke').disabled).toBe(true);
      await finish();
      expect(clear).toHaveBeenCalledOnce();
      expect(JSON.parse(screen.paper())).toEqual(drawingModel.emptyDrawing(1));
      expect(screen.button('Draw fixture stroke').disabled).toBe(false);
      expect(photos.created.map(({ base64 }) => base64)).toEqual([EXPORTED_PNG]);
      expect(screen.container.textContent).toContain(
        'Picture saved to your gallery and on this device. Pick a color and draw.'
      );
      await screen.click('Undo');
      expect(screen.paper()).toBe(original);
    },
    SAVE_CLEAR_TEST_TIMEOUT_MS
  );

  it(
    'retains ink and its Undo history when the editable save fails',
    async () => {
      const original = await drawPicture();
      files.save.mockRejectedValueOnce(new Error('The device could not save this picture.'));
      await screen.menuClick('Save and clear');
      await vi.waitFor(
        async () => {
          await act(async () => {});
          expect(screen.container.textContent).toContain('The device could not save this picture.');
        },
        { timeout: PNG_TIMEOUT_MS }
      );
      expect(files.save).toHaveBeenCalledWith(JSON.parse(original));
      expect(clear).not.toHaveBeenCalled();
      expect(screen.paper()).toBe(original);
      expect(screen.button('Draw fixture stroke').disabled).toBe(false);
      await screen.click('Undo');
      expect(JSON.parse(screen.paper())).toEqual(drawingModel.emptyDrawing());
    },
    SAVE_CLEAR_TEST_TIMEOUT_MS
  );

  it(
    'deduplicates rapid activations into one editable save and one Clear',
    async () => {
      const original = await drawPicture();
      const finish = deferSave();
      await screen.click('Drawing tools');
      const action = screen.button('Save and clear');
      await act(async () => {
        action.click();
        action.click();
      });
      await expectSaveStarted();
      expect(files.save).toHaveBeenCalledWith(JSON.parse(original));
      expect(screen.button('Drawing tools').disabled).toBe(true);
      await finish();
      expect(files.save).toHaveBeenCalledOnce();
      expect(clear).toHaveBeenCalledOnce();
      expect(JSON.parse(screen.paper())).toEqual(drawingModel.emptyDrawing(1));
    },
    SAVE_CLEAR_TEST_TIMEOUT_MS
  );

  it(
    'keeps newer ink when a snapshot save completes after the history changes',
    async () => {
      const original = await drawPicture();
      const finish = deferSave();
      await screen.menuClick('Save and clear');
      await expectSaveStarted();
      act(() => files.cohort([STROKE]));
      const changed = screen.paper();
      await finish();
      expect(files.save).toHaveBeenCalledWith(JSON.parse(original));
      expect(clear).not.toHaveBeenCalled();
      expect(screen.paper()).toBe(changed);
      expect(JSON.parse(changed).strokes).toHaveLength(2);
      expect(screen.container.textContent).toContain(
        'Picture saved. The drawing changed, so it was kept on the paper.'
      );
      await screen.click('Undo');
      expect(screen.paper()).toBe(original);
    },
    SAVE_CLEAR_TEST_TIMEOUT_MS
  );

  it(
    'never runs Clear when an editable save completes after unmount',
    async () => {
      const original = await drawPicture();
      const finish = deferSave();
      await screen.menuClick('Save and clear');
      await expectSaveStarted();
      screen.close();
      screen = null;
      await finish();
      expect(files.save).toHaveBeenCalledWith(JSON.parse(original));
      expect(clear).not.toHaveBeenCalled();
    },
    SAVE_CLEAR_TEST_TIMEOUT_MS
  );
});
