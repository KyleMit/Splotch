// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { saveFailureCopy } from '../../web/src/lib/drawing/saveFailureCopy.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { createScreen, files } from './native-drawing-screen-harness.mjs';
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

let screen;

async function mountWith(settings) {
  files.settingsRead.mockReset().mockResolvedValue(settings);
  screen = createScreen();
  await screen.mount();
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

const strokesOnPaper = () => JSON.parse(screen.paper()).strokes.length;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  photos.reset();
  files.save.mockReset().mockResolvedValue({ id: 'picture-1-fixture' });
  files.capture.mockReset().mockResolvedValue(EXPORTED_PNG);
  files.ink.mockReset().mockResolvedValue(INKED_PAPER);
  files.lock.mockReset().mockReturnValue(() => {});
  files.brushRead.mockReset().mockResolvedValue(null);
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.platform = 'android';
  files.androidApi = 33;
  files.scheme = 'light';
  files.retainClosingModal = false;
});

afterEach(() => {
  screen?.close();
  screen = null;
  vi.clearAllMocks();
});

describe('Save picture', () => {
  it(
    'adds the exported PNG to the photo library and keeps no copy inside the app',
    async () => {
      await mountWith(SETTINGS_V9(false));
      await screen.click('Draw fixture stroke');
      const drawing = JSON.parse(screen.paper());
      await screen.menuClick('Save picture');
      await settle(() => expect(photos.created).toHaveLength(1));
      expect(files.save).not.toHaveBeenCalled();
      expect(files.capture).toHaveBeenCalledWith(drawing);
      expect(photos.permissionRequests).toEqual([[true]]);
      expect(photos.created).toEqual([
        expect.objectContaining({ via: 'Album.create', album: 'Splotch', base64: EXPORTED_PNG }),
      ]);
      // Shipping says nothing on a save that landed; its polaroid flight is the whole answer.
      expect(screen.container.textContent).not.toContain('saved');
    },
    SAVE_TEST_TIMEOUT_MS
  );

  it(
    'words a refused permission exactly as the shipping banner does',
    async () => {
      files.platform = 'ios';
      files.retainClosingModal = true;
      photos.permission = 'denied';
      await mountWith(SETTINGS_V9(false));
      await screen.click('Draw fixture stroke');
      const drawing = JSON.parse(screen.paper());
      await screen.menuClick('Save picture');
      // iOS runs a menu action only once the Modal reports its dismissal.
      await act(async () => files.dismissModal());
      const shipping = saveFailureCopy('denied', 1, 'ios');
      await settle(() => expect(screen.container.textContent).toContain(shipping.detail));
      expect(screen.container.textContent).toContain(`${shipping.heading}. ${shipping.detail}`);
      expect(screen.container.textContent).not.toContain('Pictures');
      expect(files.save).not.toHaveBeenCalled();
      expect(files.capture).toHaveBeenCalledWith(drawing);
      expect(photos.created).toEqual([]);
    },
    SAVE_TEST_TIMEOUT_MS
  );
  it(
    'says the picture was not saved because the gallery needs Android 11 on older Android',
    async () => {
      files.androidApi = 29;
      await mountWith(SETTINGS_V9(false));
      await screen.click('Draw fixture stroke');
      await screen.menuClick('Save picture');
      await settle(() =>
        expect(screen.container.textContent).toContain(
          "Your picture wasn't saved. Saving to your gallery needs Android 11 or later."
        )
      );
      expect(files.save).not.toHaveBeenCalled();
      expect(photos.permissionRequests).toEqual([]);
      expect(photos.created).toEqual([]);
    },
    SAVE_TEST_TIMEOUT_MS
  );
});

describe('Auto-Save on Delete', () => {
  it(
    'saves the picture to the photo library before Clear wipes the paper',
    async () => {
      await mountWith(SETTINGS_V9(true));
      await screen.click('Draw fixture stroke');
      const drawing = JSON.parse(screen.paper());
      let strokesWhenSaved = null;
      photos.onCreate = () => {
        strokesWhenSaved = strokesOnPaper();
      };
      await screen.menuClick('Clear');
      await settle(() => expect(strokesOnPaper()).toBe(0));
      expect(strokesWhenSaved).toBe(1);
      expect(photos.created.map(({ base64 }) => base64)).toEqual([EXPORTED_PNG]);
      expect(files.capture).toHaveBeenCalledWith(drawing);
      expect(files.save).not.toHaveBeenCalled();
      expect(screen.container.textContent).toContain('Pick a color and draw.');
      expect(screen.container.textContent).not.toContain('saved');
    },
    SAVE_TEST_TIMEOUT_MS
  );

  it(
    'keeps the picture on the paper when the photo library refuses it',
    async () => {
      photos.permission = 'denied';
      await mountWith(SETTINGS_V9(true));
      await screen.click('Draw fixture stroke');
      await screen.menuClick('Clear');
      const shipping = saveFailureCopy('denied', 1, 'android');
      await settle(() => expect(screen.container.textContent).toContain(shipping.detail));
      expect(strokesOnPaper()).toBe(1);
      expect(photos.created).toEqual([]);
    },
    SAVE_TEST_TIMEOUT_MS
  );

  it(
    'clears without saving when the setting is off',
    async () => {
      await mountWith(SETTINGS_V9(false));
      await screen.click('Draw fixture stroke');
      await screen.menuClick('Clear');
      await settle(() => expect(strokesOnPaper()).toBe(0));
      expect(photos.created).toEqual([]);
      expect(files.save).not.toHaveBeenCalled();
      expect(files.capture).not.toHaveBeenCalled();
    },
    SAVE_TEST_TIMEOUT_MS
  );

  it(
    'saves nothing for a page with no visible ink',
    async () => {
      files.ink.mockResolvedValue(BLANK_PAPER);
      await mountWith(SETTINGS_V9(true));
      await screen.click('Draw fixture stroke');
      await screen.menuClick('Clear');
      await settle(() => expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(1)));
      expect(photos.created).toEqual([]);
      expect(files.save).not.toHaveBeenCalled();
    },
    SAVE_TEST_TIMEOUT_MS
  );
});
