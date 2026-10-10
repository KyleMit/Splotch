// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rgbaPng } from './native-png-fixtures.mjs';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import {
  emptyDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const files = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  lock: vi.fn(),
  capture: vi.fn(),
  ink: vi.fn(),
  export: vi.fn(),
  cohort: null,
}));

vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async (picture) => {
      await files.export(picture.base64);
      return 'sharing-closed';
    },
  },
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: files.list,
  reopenPicture: files.open,
  savePicture: vi.fn(),
  exportPng: files.export,
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":false}'),
    write: vi.fn(),
  },
}));

vi.mock('react-native', () => {
  function container({ children }) {
    return createElement('div', null, children);
  }
  return {
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove: vi.fn() }),
    },
    Platform: { OS: 'android' },
    ActivityIndicator: () => null,
    Modal: ({ visible, children }) => visible && createElement('div', { role: 'dialog' }, children),
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
      accessibilityRole,
      accessibilityState,
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          disabled,
          'aria-label': accessibilityLabel,
          role: accessibilityRole,
          'aria-checked': accessibilityState?.checked,
        },
        children
      ),
    SafeAreaView: container,
    ScrollView: container,
    View: container,
    Text: ({ children, accessibilityRole, accessibilityLiveRegion, style }) =>
      createElement(
        'span',
        {
          role: accessibilityRole,
          'aria-live': accessibilityLiveRegion,
          style: Object.assign({}, ...[style].flat().filter(Boolean)),
        },
        children
      ),
    StyleSheet: { create: (styles) => styles },
  };
});

vi.mock('react-native-svg', () => ({
  default: ({ children }) => createElement('svg', null, children),
  Rect: (props) => createElement('rect', props),
  Path: (props) => createElement('path', props),
}));

const STROKE = {
  color: 'Purple',
  brush: 'marker',
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
};

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(({ drawing, onCohort, disabled }, ref) => {
    files.cohort = onCohort;
    useImperativeHandle(
      ref,
      () => ({
        refreshGeometry: vi.fn(),
        lockInput: files.lock,
        capturePng: files.capture,
        captureInk: files.ink,
      }),
      []
    );
    return createElement(
      'button',
      {
        'data-testid': 'paper',
        disabled,
        'data-drawing': JSON.stringify(drawing),
        onClick: () => onCohort([STROKE]),
      },
      'Draw fixture stroke'
    );
  }),
}));

function createScreen() {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  const root = createRoot(container);
  function button(label) {
    return [...container.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label || element.textContent === label
    );
  }
  return {
    button,
    container,
    mount: () => act(() => root.render(createElement(DrawingScreen))),
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
    async click(label) {
      const button = [...container.querySelectorAll('button')].find(
        (element) => element.getAttribute('aria-label') === label || element.textContent === label
      );
      expect(button, label).toBeDefined();
      expect(button.disabled, label).toBe(false);
      await act(async () => button.click());
    },
    paper: () => container.querySelector('[data-testid="paper"]').getAttribute('data-drawing'),
    dialog: () => container.querySelector('[role="dialog"]'),
  };
}

const pictures = [
  { id: 'picture-1-bad', name: 'Broken picture', modifiedAt: 1 },
  { id: 'picture-2-good', name: 'Good picture', modifiedAt: 2 },
];
const SCREEN_SETUP_BUDGET_MS = 2000;
let screen;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReturnValue(pictures);
  files.open.mockReset();
  files.capture.mockReset();
  files.ink.mockReset();
  files.export.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  screen = createScreen();
  await screen.mount();
});

afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

describe('saved-picture failure feedback', () => {
  it('retains artwork and refuses file access when active input cannot be locked', async () => {
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    await screen.click('Pictures');
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
      await screen.click('Draw fixture stroke');
      const original = screen.paper();
      files.open.mockImplementation(async (id) => {
        if (id === pictures[0].id) {
          if (failure === 'corrupt') return parseDrawing({ version: 99 });
          throw new Error('This saved picture cannot be opened.');
        }
        return emptyDrawing();
      });
      await screen.click('Pictures');
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
      await screen.click('Pictures');
      expect(screen.dialog().querySelector('[role="alert"]')).toBeNull();
      await screen.click('Open picture from Broken picture');
      expect(screen.dialog().querySelector('[role="alert"]')).not.toBeNull();
      await screen.click('Open picture from Good picture');
      expect(screen.dialog()).toBeNull();
      expect(JSON.parse(screen.paper()).strokes).toEqual([]);
      await screen.click('Undo');
      expect(screen.paper()).toBe(original);
      await screen.click('Pictures');
      expect(screen.dialog().querySelector('[role="alert"]')).toBeNull();
    }
  );

  it('retains the complete long refusal in a nonshrinking modal notice', async () => {
    const message = 'This saved picture is not a supported drawing. '.repeat(4).trim();
    files.open.mockRejectedValueOnce(new Error(message));
    await screen.click('Pictures');
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
    await screen.click('Pictures');
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
    await screen.click('Draw fixture stroke');
    let finish;
    files.capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await screen.click('Export PNG');
    expect(screen.button('Draw fixture stroke').disabled).toBe(true);
    act(() => files.cohort([STROKE]));
    await act(async () => finish('old-picture-png'));
    expect(files.export).not.toHaveBeenCalled();
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(2);
    expect(screen.container.textContent).toContain('The picture changed before export finished.');
  });
});

describe('Clear observation refusal', () => {
  it('retains canonical history and rainbow when the real native alpha owner refuses observation', async () => {
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    files.ink.mockResolvedValueOnce('ink-observation-input');
    await screen.click('Clear');
    expect(files.ink).toHaveBeenCalledOnce();
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
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    await screen.click('Coloring pages');
    const choices = [...screen.dialog().querySelectorAll('[role="radio"]')];
    expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual([
      'Blank paper',
      'Sunshine',
      'Garden flower',
      'Little turtle',
    ]);
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    const underlying = [...screen.container.querySelectorAll('button')].filter(
      (button) => !screen.dialog().contains(button)
    );
    expect(underlying.length).toBeGreaterThan(10);
    expect(underlying.every((button) => button.disabled)).toBe(true);
    await act(async () => screen.button('Clear').click());
    expect(screen.paper()).toBe(original);
    await screen.click('Keep drawing');
    expect(screen.dialog()).toBeNull();
    expect(screen.paper()).toBe(original);
    expect(screen.button('Save picture').disabled).toBe(false);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing());
    expect(screen.button('Undo').disabled).toBe(true);
  });

  it('changes page and paint in one history entry and keeps same-page paint intact', async () => {
    await screen.click('Draw fixture stroke');
    const original = screen.paper();
    await screen.click('Coloring pages');
    await screen.click('Garden flower');
    expect(screen.dialog()).toBeNull();
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(0, 'flower'));
    expect(screen.container.textContent).toContain(
      'Garden flower ready. Undo brings your picture back.'
    );
    await screen.click('Draw fixture stroke');
    const painted = screen.paper();
    await screen.click('Coloring pages');
    expect(screen.button('Garden flower').getAttribute('aria-checked')).toBe('true');
    await screen.click('Garden flower');
    expect(screen.dialog()).toBeNull();
    expect(screen.paper()).toBe(painted);
    await screen.click('Undo');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(0, 'flower'));
    await screen.click('Undo');
    expect(screen.paper()).toBe(original);
  });

  it(
    'preserves the selected page through Clear and restores blank selection atomically with Undo',
    async () => {
      await screen.click('Coloring pages');
      await screen.click('Little turtle');
      await screen.click('Draw fixture stroke');
      const painted = screen.paper();
      let finishInk;
      files.ink.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishInk = resolve;
          })
      );
      await screen.click('Clear');
      expect(screen.button('Clear').disabled).toBe(true);
      await act(async () => finishInk(rgbaPng(1024, 768, 255).toString('base64')));
      await vi.waitFor(
        async () => {
          await act(async () => {});
          expect(JSON.parse(screen.paper())).toEqual(emptyDrawing(1, 'turtle'));
        },
        { timeout: PNG_TIMEOUT_MS }
      );
      expect(screen.button('Clear').disabled).toBe(false);
      await screen.click('Undo');
      expect(screen.paper()).toBe(painted);
      await screen.click('Coloring pages');
      await screen.click('Blank paper');
      expect(JSON.parse(screen.paper())).toEqual(emptyDrawing());
      await screen.click('Undo');
      expect(screen.paper()).toBe(painted);
    },
    PNG_TIMEOUT_MS + SCREEN_SETUP_BUDGET_MS
  );
});
