// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rgbaPng } from './native-png-fixtures.mjs';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { PAPER_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';
import {
  emptyDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  createScreen,
  expectSavedSettingsReread,
  files,
  pictures,
  STROKE,
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
  files.list.mockReturnValue(pictures);
  files.open.mockReset();
  files.capture.mockReset();
  files.ink.mockReset();
  files.export.mockReset();
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
  await screen.click('More colors');
  const choice = screen.dialog().querySelector('[aria-label^="Explore "]');
  const chosen = choice.getAttribute('aria-label').slice('Explore '.length);
  await screen.click(`Explore ${chosen}`);
  await screen.click('Use color');
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
it.each([
  ['paint', 'Retry saving', chooseUnreadPaint],
  ['paint', 'Drawing sound', chooseUnreadPaint],
  ['width', 'Retry saving', chooseUnreadWidths],
  ['width', 'Drawing sound', chooseUnreadWidths],
])(
  'keeps %s choices session-only through %s, then rereads before a new explicit choice',
  async (kind, recovery, choose) => {
    await act(async () => screen.close());
    const original = JSON.stringify({
      version: kind === 'paint' ? 3 : 2,
      soundEnabled: true,
      strokeWidth: 'thick',
      eraserWidth: 'thin',
      ...(kind === 'paint' ? { selectedColor: '#FEDCBA', customColors: ['#FEDCBA'] } : {}),
    });
    let stored = original;
    files.settingsRead.mockImplementation(async () => stored);
    files.settingsRead.mockRejectedValueOnce(new Error('temporarily unreadable'));
    files.settingsWrite.mockImplementation(async (snapshot) => {
      stored = snapshot;
    });
    screen = createScreen();
    await act(async () => screen.mount());
    expect(screen.container.textContent).toContain(UNREAD_SETTINGS_WARNING);
    const chosen = await choose(true);
    const strokes = JSON.parse(screen.paper()).strokes;
    expect(strokes.map((stroke) => (kind === 'paint' ? stroke.color : stroke.width))).toEqual(
      kind === 'paint' ? [chosen] : [4, 28]
    );
    if (kind === 'width') await openTools();
    const label = kind === 'paint' ? `Custom paint ${chosen}` : 'Eraser width: Thick';
    expect(
      screen.container.querySelector(`[aria-label="${label}"]`).getAttribute('aria-pressed')
    ).toBe('true');
    expect(files.settingsWrite).not.toHaveBeenCalled();
    expect(stored).toBe(original);
    expect(screen.container.textContent).toContain(UNREAD_SETTINGS_WARNING);
    await menuClick('Settings');
    expect(screen.dialog().textContent).toContain(UNREAD_SETTINGS_WARNING);
    await screen.click(recovery);
    expect(files.settingsWrite).not.toHaveBeenCalled();
    expect(stored).toBe(original);
    await expectSavedSettingsReread(screen);
    expect(await choose(false)).toBe(chosen);
    await menuClick('Settings');
    if (recovery === 'Drawing sound') await screen.click('Drawing sound');
    const writes = (kind === 'paint' ? 1 : 2) + (recovery === 'Drawing sound' ? 1 : 0);
    expect(files.settingsWrite).toHaveBeenCalledTimes(writes);
    expect(JSON.parse(stored)).toEqual({
      version: 11,
      ...UNTOUCHED_SETTINGS,
      coloringBookEnabled: true,
      aiEnabled: false,
      parentPolicies: {
        ai: 'always',
        imageReport: 'always',
        feedback: 'always',
        parentCenter: 'always',
      },
      appearance: 'system',
      soundEnabled: recovery === 'Retry saving',
      strokeWidth: kind === 'paint' ? 'thick' : 'thin',
      eraserWidth: kind === 'paint' ? 'thin' : 'thick',
      selectedColor: chosen,
      customColors: kind === 'paint' ? [chosen, '#FEDCBA'] : [],
      soundLevel: 'medium',
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      orientation: 'portrait',
    });
    expect(screen.dialog().textContent).not.toContain(UNREAD_SETTINGS_WARNING);
  }
);

describe('custom paints wired to the drawing screen', () => {
  it('locks input for exploration, persists only the chosen color and carries it through drawing and remount', async () => {
    await act(async () => {});
    await screen.click('More colors');
    expect(files.lock).toHaveBeenCalledTimes(1);
    const tile = screen.dialog().querySelector('[aria-label^="Explore "]');
    const chosen = tile.getAttribute('aria-label').slice('Explore '.length);
    await screen.click(`Explore ${chosen}`);
    expect(files.settingsWrite).not.toHaveBeenCalled();
    await screen.click('Use color');
    expect(screen.dialog()).toBeNull();
    const snapshot = files.settingsWrite.mock.calls.at(-1)[0];
    expect(JSON.parse(snapshot)).toMatchObject({
      version: 11,
      coloringBookEnabled: true,
      aiEnabled: false,
      parentPolicies: { ai: 'always', feedback: 'always', parentCenter: 'always' },
      appearance: 'system',
      selectedColor: chosen,
      customColors: [chosen],
    });
    await drawStroke();
    expect(JSON.parse(screen.paper()).strokes[0].color).toBe(chosen);
    screen.close();
    files.settingsRead.mockResolvedValue(snapshot);
    screen = createScreen();
    await act(async () => screen.mount());
    await drawStroke();
    expect(JSON.parse(screen.paper()).strokes[0].color).toBe(chosen);
    expect(
      screen.container
        .querySelector(`[aria-label="Custom paint ${chosen}"]`)
        .getAttribute('aria-pressed')
    ).toBe('true');
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
      '{"version":11,"soundEnabled":false,"strokeWidth":"thin","eraserWidth":"thick","selectedColor":"Purple","customColors":[],"appearance":"system","aiEnabled":false,"parentPolicies":{"ai":"always","imageReport":"always","feedback":"always","parentCenter":"always"},"coloringBookEnabled":true,"soundLevel":"medium","undoButtonEnabled":true,"strokeWidthControlEnabled":true,"orientation":"portrait","saveOnDeleteEnabled":false,"buttonScale":100,"reduceMotion":"system","whatsNewSeen":null,"pencilEraserEnabled":true,"applePencilSeen":false}'
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

describe('saved-picture failure feedback', () => {
  it('retains artwork and refuses file access when active input cannot be locked', async () => {
    await drawStroke();
    const original = screen.paper();
    await menuClick('Pictures');
    files.lock.mockImplementationOnce(() => {
      throw new Error('Finish drawing before using this control.');
    });
    await screen.click('Open picture from Good picture');
    expect(files.open).not.toHaveBeenCalled();
    expect(screen.paper()).toBe(original);
    expect(screen.dialog().querySelector('[role="alert"]').textContent).toBe(
      'Finish drawing before using this control.'
    );
  });

  it.each(['corrupt', 'missing'])(
    'shows %s refusal inside the open dialog and preserves history',
    async (failure) => {
      await drawStroke();
      const original = screen.paper();
      files.open.mockImplementation(async (id) => {
        if (id === pictures[0].id) {
          if (failure === 'corrupt') return parseDrawing({ version: 99 });
          throw new Error('This saved picture cannot be opened.');
        }
        return emptyDrawing();
      });
      await menuClick('Pictures');
      expect(screen.dialog().querySelector('[role="alert"]')).toBeNull();
      await screen.click('Open picture from Broken picture');
      const alert = screen.dialog().querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert.textContent).toBe(
        failure === 'corrupt'
          ? 'This saved picture is not a supported drawing.'
          : 'This saved picture cannot be opened.'
      );
      expect(alert.getAttribute('aria-live')).toBe('polite');
      expect(screen.paper()).toBe(original);
      await screen.click('Close');
      await menuClick('Pictures');
      expect(screen.dialog().querySelector('[role="alert"]')).toBeNull();
      await screen.click('Open picture from Broken picture');
      expect(screen.dialog().querySelector('[role="alert"]')).not.toBeNull();
      await screen.click('Open picture from Good picture');
      expect(screen.dialog()).toBeNull();
      expect(JSON.parse(screen.paper()).strokes).toEqual([]);
      const openedNotice = 'Picture opened. Undo returns to your previous picture.';
      expect(screen.container.textContent).toContain(openedNotice);
      await screen.click('Undo');
      expect(screen.paper()).toBe(original);
      expect(screen.container.textContent).not.toContain(openedNotice);
      await menuClick('Pictures');
      expect(screen.dialog().querySelector('[role="alert"]')).toBeNull();
    }
  );

  it('retains the complete long refusal in a nonshrinking modal notice', async () => {
    const message = 'This saved picture is not a supported drawing. '.repeat(4).trim();
    files.open.mockRejectedValueOnce(new Error(message));
    await menuClick('Pictures');
    await screen.click('Open picture from Broken picture');
    const alert = screen.dialog().querySelector('[role="alert"]');
    expect(alert.textContent).toBe(message);
    expect(alert.style.flexShrink).toBe('0');
    expect(alert.style.alignSelf).toBe('stretch');
    const status = [...screen.container.querySelectorAll('[aria-live="polite"]')].find(
      (element) => !screen.dialog().contains(element)
    );
    expect(status.style.flexShrink).toBe('1');
    expect(alert.style.maxHeight).toBe('');
    expect(alert.style.overflow).toBe('');
    await screen.click('Close');
    expect(screen.dialog()).toBeNull();
  });

  it('clears the previous refusal immediately when retrying an asynchronous open', async () => {
    files.open.mockRejectedValueOnce(new Error('This saved picture cannot be opened.'));
    await menuClick('Pictures');
    await screen.click('Open picture from Broken picture');
    expect(screen.dialog().querySelector('[role="alert"]')).not.toBeNull();
    let finish;
    files.open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await screen.click('Open picture from Good picture');
    expect(screen.dialog().querySelector('[role="alert"]')).toBeNull();
    await act(async () => finish(emptyDrawing()));
    expect(screen.dialog()).toBeNull();
  });
});

describe('controller output snapshot ownership', () => {
  it('refuses a captured PNG if the canonical history ref changed before output', async () => {
    await drawStroke();
    let finish;
    files.capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await menuClick('Export PNG');
    expect(screen.button('Draw fixture stroke').disabled).toBe(true);
    act(() => files.cohort([STROKE]));
    await act(async () => finish('old-picture-png'));
    expect(files.export).not.toHaveBeenCalled();
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(2);
    expect(screen.container.textContent).toContain('The picture changed before export finished.');
  });
});

describe('Clear observation refusal', () => {
  it.each(['Clear', 'Save and clear'])(
    'retains history and rainbow when %s observation fails',
    async (action) => {
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
    }
  );
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
    expect(screen.container.textContent).toContain(
      'Garden flower ready. Undo brings your picture back.'
    );
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
