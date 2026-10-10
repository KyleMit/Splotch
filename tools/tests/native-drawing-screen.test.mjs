// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import {
  emptyDrawing,
  parseDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const files = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  lock: vi.fn(),
  capture: vi.fn(),
  ink: vi.fn(),
  export: vi.fn(),
  settingsRead: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":false}'),
  settingsWrite: vi.fn().mockResolvedValue(undefined),
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
    read: files.settingsRead,
    write: files.settingsWrite,
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
    Switch: ({ value, disabled, onValueChange, accessibilityLabel }) =>
      createElement('button', {
        role: 'switch',
        'aria-label': accessibilityLabel,
        'aria-checked': value,
        disabled,
        onClick: () => onValueChange(!value),
      }),
    Modal: ({ visible, children }) => visible && createElement('div', { role: 'dialog' }, children),
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
      accessibilityState,
      'aria-pressed': pressed,
      style,
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          disabled,
          'aria-label': accessibilityLabel,
          'aria-pressed': pressed,
          'data-native-selected': accessibilityState?.selected,
          style:
            typeof style === 'function'
              ? undefined
              : Object.assign({}, ...[style].flat().filter(Boolean)),
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
  Rect: () => null,
  Path: () => null,
}));

const STROKE = {
  color: 'Purple',
  brush: 'marker',
  width: 22,
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
};

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(
    ({ drawing, onCohort, color, brush, strokeWidth, eraserWidth }, ref) => {
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
          'data-drawing': JSON.stringify(drawing),
          onClick: () =>
            onCohort([
              {
                ...strokeStyle(
                  brush,
                  color,
                  drawing,
                  brush === 'eraser' ? eraserWidth : strokeWidth
                ),
                points: STROKE.points,
              },
            ]),
        },
        'Draw fixture stroke'
      );
    }
  ),
}));

function createScreen() {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  const root = createRoot(container);
  return {
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
let screen;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.list.mockReturnValue(pictures);
  files.open.mockReset();
  files.capture.mockReset();
  files.ink.mockReset();
  files.export.mockReset();
  files.lock.mockReset().mockReturnValue(() => {});
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  screen = createScreen();
  screen.mount();
});

afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

describe('drawing width controls', () => {
  it('keeps accessible, touch-sized independent selections through tool switches and reopening settings', async () => {
    await screen.click('Marker');
    const control = (label) => screen.container.querySelector(`[aria-label="${label}"]`);
    expect(control('Drawing width: Medium').getAttribute('aria-pressed')).toBe('true');
    expect(control('Drawing width: Medium').getAttribute('data-native-selected')).toBe('true');
    expect(parseFloat(control('Drawing width: Thin').style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(parseFloat(control('Drawing width: Thin').style.minWidth)).toBeGreaterThanOrEqual(48);
    await screen.click('Drawing width: Thin');
    await screen.click('Draw fixture stroke');
    await screen.click('Eraser');
    expect(control('Eraser width: Medium').getAttribute('aria-pressed')).toBe('true');
    await screen.click('Eraser width: Thick');
    await screen.click('Draw fixture stroke');
    expect(JSON.parse(screen.paper()).strokes.map(({ width }) => width)).toEqual([11, 88]);
    await screen.click('Marker');
    expect(control('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    expect(control('Drawing width: Thin').textContent).toContain('✓');
    await screen.click('Settings');
    await screen.click('Close Settings');
    expect(control('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    expect(files.settingsWrite).toHaveBeenLastCalledWith(
      '{"version":2,"soundEnabled":false,"strokeWidth":"thin","eraserWidth":"thick"}'
    );
    const snapshot = files.settingsWrite.mock.calls.at(-1)[0];
    screen.close();
    files.settingsRead.mockResolvedValue(snapshot);
    screen = createScreen();
    await act(async () => screen.mount());
    expect(control('Drawing width: Thin').getAttribute('aria-pressed')).toBe('true');
    await screen.click('Eraser');
    expect(control('Eraser width: Thick').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a failed width choice usable and retries the same full settings snapshot', async () => {
    await screen.click('Marker');
    files.settingsWrite.mockRejectedValueOnce(new Error('disk full'));
    await screen.click('Drawing width: Thick');
    await screen.click('Draw fixture stroke');
    expect(JSON.parse(screen.paper()).strokes[0].width).toBe(44);
    expect(screen.container.textContent).toContain('could not be saved');
    await screen.click('Settings');
    await screen.click('Retry saving');
    expect(files.settingsWrite.mock.calls.at(-1)).toEqual(files.settingsWrite.mock.calls.at(-2));
    expect(screen.dialog().textContent).not.toContain('could not be saved');
  });

  it.each(['Retry saving', 'Drawing sound'])(
    'retains the read warning and stored preferences through width taps until explicit %s',
    async (recovery) => {
      await act(async () => screen.close());
      const original =
        '{"version":2,"soundEnabled":true,"strokeWidth":"thick","eraserWidth":"thin"}';
      let saved = original;
      files.settingsRead.mockImplementation(async () => saved);
      files.settingsRead.mockRejectedValueOnce(new Error('temporarily unreadable'));
      files.settingsWrite.mockImplementation(async (snapshot) => {
        saved = snapshot;
      });
      screen = createScreen();
      await act(async () => screen.mount());
      const warning =
        'Drawing settings could not be read. Sound is off. Width choices work for this session. Choose your settings and retry saving.';
      expect(screen.container.textContent).toContain(warning);
      await screen.click('Marker');
      await screen.click('Drawing width: Thin');
      await screen.click('Draw fixture stroke');
      await screen.click('Eraser');
      await screen.click('Eraser width: Thick');
      await screen.click('Draw fixture stroke');
      expect(JSON.parse(screen.paper()).strokes.map(({ width }) => width)).toEqual([11, 88]);
      expect(files.settingsWrite).not.toHaveBeenCalled();
      expect(saved).toBe(original);
      expect(screen.container.textContent).toContain(warning);
      await screen.click('Settings');
      expect(screen.dialog().textContent).toContain(warning);
      await screen.click(recovery);
      expect(files.settingsWrite).toHaveBeenCalledOnce();
      expect(JSON.parse(saved)).toEqual({
        version: 2,
        soundEnabled: recovery === 'Drawing sound',
        strokeWidth: 'thin',
        eraserWidth: 'thick',
      });
      expect(screen.dialog().textContent).not.toContain(warning);
    }
  );
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
    await screen.click('Draw fixture stroke');
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
