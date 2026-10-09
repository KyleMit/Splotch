// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import {
  emptyDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const files = vi.hoisted(() => ({ list: vi.fn(), open: vi.fn() }));

vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: files.list,
  reopenPicture: files.open,
  savePicture: vi.fn(),
  exportPng: vi.fn(),
}));

vi.mock('react-native', () => {
  function container({ children }) {
    return createElement('div', null, children);
  }
  return {
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

const STROKE = {
  color: 'Purple',
  brush: 'marker',
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
};

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(({ drawing, onStroke }, _ref) =>
    createElement(
      'button',
      {
        'data-testid': 'paper',
        'data-drawing': JSON.stringify(drawing),
        onClick: () => onStroke(STROKE),
      },
      'Draw fixture stroke'
    )
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
  screen = createScreen();
  screen.mount();
});

afterEach(() => {
  screen.close();
  vi.clearAllMocks();
});

describe('saved-picture failure feedback', () => {
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
