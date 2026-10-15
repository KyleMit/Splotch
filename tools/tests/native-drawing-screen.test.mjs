// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rgbaPng } from './native-png-fixtures.mjs';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { PAPER_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  createScreen,
  expectSavedSettingsReread,
  files,
  UNTOUCHED_SETTINGS,
} from './native-drawing-screen-harness.mjs';

const SCREEN_SETUP_BUDGET_MS = 2000;
let screen;
async function openTools() {
  if (screen.button('Pen')) return;
  const opener = [...screen.container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Drawing tools'
  );
  expect(opener).toBeDefined();
  await screen.click(opener.getAttribute('aria-label'));
}
async function menuClick(label) {
  await openTools();
  await screen.click(label);
}
async function drawStroke() {
  if (screen.button('Pen')) await screen.click('Keep drawing');
  await screen.click('Draw fixture stroke');
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.capture.mockReset();
  files.ink.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  files.brushRead.mockReset().mockResolvedValue(null);
  files.brushWrite.mockReset().mockResolvedValue(undefined);
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.scheme = 'light';
  screen = createScreen();
  await act(async () => screen.mount());
});

afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

const UNREAD_SETTINGS_WARNING =
  'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.';

async function chooseUnreadPaint(draw) {
  const chosen = '#2196F3';
  await screen.openColors();
  await screen.click(chosen);
  if (draw) {
    await menuClick('Pen');
    await drawStroke();
  }
  return chosen;
}
async function chooseUnreadWidths(draw) {
  await menuClick('Pen');
  await menuClick('Drawing width: Thin');
  if (draw) await drawStroke();
  await menuClick('Eraser');
  await menuClick('Eraser width: Thick');
  if (draw) await drawStroke();
  return 'Purple';
}
async function mountUnread(original) {
  await act(async () => screen.close());
  const stored = { current: original };
  files.settingsRead.mockImplementation(async () => stored.current);
  files.settingsRead.mockRejectedValueOnce(new Error('temporarily unreadable'));
  files.settingsWrite.mockImplementation(async (snapshot) => {
    stored.current = snapshot;
  });
  screen = createScreen();
  await act(async () => screen.mount());
  expect(screen.container.textContent).toContain(UNREAD_SETTINGS_WARNING);
  return stored;
}
it.each(['Retry saving', 'Drawing sound'])(
  'keeps width choices session-only through %s, then rereads before a new explicit choice',
  async (recovery) => {
    const original = JSON.stringify({
      version: 2,
      soundEnabled: true,
      strokeWidth: 'thick',
      eraserWidth: 'thin',
    });
    const stored = await mountUnread(original);
    const chosen = await chooseUnreadWidths(true);
    expect(JSON.parse(screen.paper()).strokes.map((stroke) => stroke.width)).toEqual([4, 28]);
    await openTools();
    expect(
      screen.container
        .querySelector('[aria-label="Eraser width: Thick"]')
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(files.settingsWrite).not.toHaveBeenCalled();
    expect(stored.current).toBe(original);
    expect(screen.container.textContent).toContain(UNREAD_SETTINGS_WARNING);
    await menuClick('Settings');
    expect(screen.dialog().textContent).toContain(UNREAD_SETTINGS_WARNING);
    await screen.click(recovery);
    expect(files.settingsWrite).not.toHaveBeenCalled();
    expect(stored.current).toBe(original);
    await expectSavedSettingsReread(screen);
    expect(await chooseUnreadWidths(false)).toBe(chosen);
    await menuClick('Settings');
    if (recovery === 'Drawing sound') await screen.click('Drawing sound');
    expect(files.settingsWrite).toHaveBeenCalledTimes(recovery === 'Drawing sound' ? 3 : 2);
    expect(JSON.parse(stored.current)).toEqual({
      version: 16,
      ...UNTOUCHED_SETTINGS,
      coloringBookEnabled: true,
      aiEnabled: false,
      parentPolicies: {
        ai: 'always',
        imageReport: 'always',
        externalLinks: 'always',
        feedback: 'always',
        parentCenter: 'always',
      },
      appearance: 'system',
      soundEnabled: recovery === 'Retry saving',
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      soundVolume: 50,
      drawingSoundEnabled: true,
      deleteSoundEnabled: true,
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      toolDrawerEnabled: true,
      screenshotEnabled: true,
      aiCustomizationEnabled: true,
      autoSaveAiEnabled: false,
      orientation: 'portrait',
    });
    expect(screen.dialog().textContent).not.toContain(UNREAD_SETTINGS_WARNING);
  }
);
it.each(['Retry saving', 'Drawing sound'])(
  'keeps a picked paint through unread settings, %s and a reread, and never saves it',
  async (recovery) => {
    const stored = await mountUnread(
      JSON.stringify({
        version: 3,
        soundEnabled: true,
        strokeWidth: 'thick',
        eraserWidth: 'thin',
        selectedColor: '#FEDCBA',
        customColors: ['#FEDCBA'],
      })
    );
    const chosen = await chooseUnreadPaint(true);
    expect(JSON.parse(screen.paper()).strokes.map((stroke) => stroke.color)).toEqual([chosen]);
    const pressed = () =>
      screen.container
        .querySelector(`[aria-label="Custom paint ${chosen}"]`)
        .getAttribute('aria-pressed');
    expect(pressed()).toBe('true');
    await menuClick('Settings');
    await screen.click(recovery);
    await expectSavedSettingsReread(screen);
    expect(pressed()).toBe('true');
    await menuClick('Settings');
    await screen.click('Drawing sound');
    expect(files.settingsWrite).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(stored.current);
    expect(saved).toMatchObject({ version: 16, strokeWidth: 'thick', eraserWidth: 'thin' });
    expect(saved).not.toHaveProperty('selectedColor');
    expect(saved).not.toHaveProperty('customColors');
  }
);

describe('custom paints wired to the drawing screen', () => {
  it('locks input while the Color Picker is open, draws with the picked color without saving it, and starts a remount on Purple', async () => {
    await act(async () => {});
    await screen.openColors();
    expect(files.lock).toHaveBeenCalledTimes(1);
    const chosen = '#2196F3';
    await screen.click(chosen);
    expect(screen.dialog()).toBeNull();
    await drawStroke();
    expect(JSON.parse(screen.paper()).strokes[0].color).toBe(chosen);
    expect(files.settingsWrite).not.toHaveBeenCalled();
    screen.close();
    screen = createScreen();
    await act(async () => screen.mount());
    await drawStroke();
    expect(JSON.parse(screen.paper()).strokes[0].color).toBe('Purple');
    expect(screen.container.querySelector(`[aria-label="Custom paint ${chosen}"]`)).toBeNull();
  });
});

describe('drawing width controls', () => {
  it('keeps accessible, touch-sized independent selections through tool switches and reopening settings', async () => {
    await menuClick('Pen');
    const control = (label) => screen.container.querySelector(`[aria-label="${label}"]`);
    expect(control('Drawing width: Medium').getAttribute('aria-pressed')).toBe('true');
    expect(control('Drawing width: Medium').getAttribute('data-native-selected')).toBe('true');
    expect(parseFloat(control('Drawing width: Thin').style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(parseFloat(control('Drawing width: Thin').style.minWidth)).toBeGreaterThanOrEqual(48);
    await menuClick('Drawing width: Thin');
    await drawStroke();
    await menuClick('Eraser');
    expect(control('Eraser width: Medium').getAttribute('aria-pressed')).toBe('true');
    await menuClick('Eraser width: Thick');
    await drawStroke();
    expect(JSON.parse(screen.paper()).strokes.map(({ width }) => width)).toEqual([4, 28]);
    await menuClick('Pen');
    expect(control('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    expect(control('Drawing width: Thin').textContent).toContain('✓');
    await menuClick('Settings');
    await screen.click('Close Settings');
    await openTools();
    expect(control('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    expect(files.settingsWrite).toHaveBeenLastCalledWith(
      '{"version":16,"soundEnabled":false,"strokeWidth":"thin","eraserWidth":"thick","appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","externalLinks":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundVolume":50,"drawingSoundEnabled":true,"deleteSoundEnabled":true,"undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false,"toolbarStyle":"buttons","toolDrawerEnabled":true,"screenshotEnabled":true,"aiCustomizationEnabled":true,"autoSaveAiEnabled":false}'
    );
    const snapshot = files.settingsWrite.mock.calls.at(-1)[0];
    screen.close();
    files.settingsRead.mockResolvedValue(snapshot);
    screen = createScreen();
    await act(async () => screen.mount());
    await openTools();
    expect(control('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    await menuClick('Eraser');
    expect(control('Eraser width: Thick').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a failed width choice usable and retries the same full settings snapshot', async () => {
    await menuClick('Pen');
    files.settingsWrite.mockRejectedValueOnce(new Error('disk full'));
    await menuClick('Drawing width: Thick');
    await drawStroke();
    expect(JSON.parse(screen.paper()).strokes[0].width).toBe(14);
    expect(screen.container.textContent).toContain('could not be saved');
    await menuClick('Settings');
    await screen.click('Retry saving');
    expect(files.settingsWrite.mock.calls.at(-1)).toEqual(files.settingsWrite.mock.calls.at(-2));
    expect(screen.dialog().textContent).not.toContain('could not be saved');
  });
});

describe('Clear observation refusal', () => {
  it.each(['Clear'])('retains history and rainbow when %s observation fails', async (action) => {
    await drawStroke();
    const original = screen.paper();
    files.ink.mockResolvedValueOnce('ink-observation-input');
    await menuClick(action);
    expect(files.ink).toHaveBeenCalledOnce();
    expect(files.save).not.toHaveBeenCalled();
    expect(screen.paper()).toBe(original);
    expect(screen.container.textContent).toContain(
      'Picture capture returned an invalid or unsupported PNG.'
    );
    await screen.click('Undo');
    expect(JSON.parse(screen.paper()).strokes).toEqual([]);
    expect(JSON.parse(screen.paper()).rainbow).toBe(0);
  });
});

describe('coloring-page controls through the real drawing screen', () => {
  it('disables the underlying toolbar and paper while the real picker is open', async () => {
    await drawStroke();
    const original = screen.paper();
    await menuClick('Coloring pages');
    const choices = [...screen.dialog().querySelectorAll('[role="radio"]')];
    expect(screen.dialog().textContent).toContain(
      'Your drawing stays. Undo brings the last page back.'
    );
    const expectedPages = [
      'Blank paper',
      'Sunshine',
      'Garden flower',
      'Little turtle',
      'Cat',
      'Cow',
      'Dog',
      'Duck',
      'Horse',
      'Pig',
    ];
    expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual(expectedPages);
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual(
      expectedPages.map((label) => String(label === 'Blank paper'))
    );
    const underlying = [...screen.container.querySelectorAll('button')].filter(
      (button) => !screen.dialog().contains(button)
    );
    expect(underlying.length).toBeGreaterThan(10);
    expect(underlying.every((button) => button.disabled)).toBe(true);
    await act(async () => screen.button('Drawing tools').click());
    expect(screen.paper()).toBe(original);
    await screen.click('Keep drawing');
    expect(screen.dialog()).toBeNull();
    expect(screen.paper()).toBe(original);
    await openTools();
    expect(screen.button('Save picture').disabled).toBe(false);
    await screen.click('Keep drawing');
    await screen.click('Undo');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing());
    expect(screen.button('Undo').disabled).toBe(true);
  });

  it('retains paint through one page-change history entry and keeps same-page paint intact', async () => {
    await drawStroke();
    const original = screen.paper();
    await menuClick('Coloring pages');
    await screen.click('Garden flower');
    expect(screen.dialog()).toBeNull();
    const paged = { ...JSON.parse(original), pageId: 'flower' };
    expect(JSON.parse(screen.paper())).toEqual(paged);
    expect(screen.container.textContent).toContain('Garden flower ready.');
    await screen.click('Undo');
    expect(screen.paper()).toBe(original);
    expect(screen.container.textContent).not.toContain('Garden flower ready.');
    expect(screen.button('Undo').disabled).toBe(false);
    await menuClick('Coloring pages');
    await screen.click('Garden flower');
    expect(JSON.parse(screen.paper())).toEqual(paged);
    await drawStroke();
    const painted = screen.paper();
    expect(JSON.parse(painted).strokes).toHaveLength(2);
    await menuClick('Coloring pages');
    expect(screen.button('Garden flower').getAttribute('aria-checked')).toBe('true');
    await screen.click('Garden flower');
    expect(screen.dialog()).toBeNull();
    expect(screen.paper()).toBe(painted);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper())).toEqual(paged);
    await screen.click('Undo');
    expect(screen.paper()).toBe(original);
  });

  it(
    'preserves the selected page through Clear and restores blank selection atomically with Undo',
    async () => {
      await menuClick('Coloring pages');
      await screen.click('Little turtle');
      await drawStroke();
      const painted = screen.paper();
      let finishInk;
      files.ink.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishInk = resolve;
          })
      );
      await menuClick('Clear');
      expect(screen.button('Draw fixture stroke').disabled).toBe(true);
      expect(screen.button('Drawing tools').disabled).toBe(true);
      await act(async () => finishInk(rgbaPng(1024, 768, 255).toString('base64')));
      await vi.waitFor(
        async () => {
          await act(async () => {});
          expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(1, 'turtle'));
        },
        { timeout: PNG_TIMEOUT_MS }
      );
      expect(screen.button('Draw fixture stroke').disabled).toBe(false);
      await openTools();
      expect(screen.button('Clear').disabled).toBe(false);
      await screen.click('Keep drawing');
      await screen.click('Undo');
      expect(screen.paper()).toBe(painted);
      await menuClick('Coloring pages');
      await screen.click('Blank paper');
      expect(JSON.parse(screen.paper())).toEqual({ ...JSON.parse(painted), pageId: 'blank' });
      await screen.click('Undo');
      expect(screen.paper()).toBe(painted);
    },
    PNG_TIMEOUT_MS + SCREEN_SETUP_BUDGET_MS
  );

  it('recodes the real open picker previews with the system theme and preserves ink', async () => {
    await drawStroke();
    const original = screen.paper();
    await menuClick('Coloring pages');
    for (const theme of ['light', 'dark']) {
      files.scheme = theme;
      await act(async () => screen.mount());
      const preview = screen.button('Sunshine').querySelector('svg');
      expect(preview.querySelector('rect').getAttribute('fill')).toBe(PAPER_THEMES[theme].paper);
      const outlines = [...preview.querySelectorAll('path')];
      expect(outlines).toHaveLength(4);
      expect(outlines.map((path) => path.getAttribute('stroke'))).toEqual(
        Array(4).fill(PAPER_THEMES[theme].outline)
      );
      expect(screen.paper()).toBe(original);
    }
  });
});
