// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: files.list,
  reopenPicture: files.open,
  savePicture: vi.fn(),
  exportPng: files.export,
}));

vi.mock('react-native', () => {
  function container({ children }) {
    return createElement('div', null, children);
  }
  return {
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove: vi.fn() }),
    },
    Platform: { OS: 'android' },
    ActivityIndicator: () => null,
    Modal: ({ visible, children }) => visible && createElement('div', { role: 'dialog' }, children),
    Pressable: ({ children, onPress, disabled, accessibilityLabel }) =>
      createElement(
        'button',
        { onClick: onPress, disabled, 'aria-label': accessibilityLabel },
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
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
};

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(({ drawing, onCohort }, ref) => {
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
  screen = createScreen();
  screen.mount();
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
