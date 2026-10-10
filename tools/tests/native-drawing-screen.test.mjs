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
          role: accessibilityRole,
          'aria-label': accessibilityLabel,
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
  DrawingSurface: forwardRef(({ drawing, onStroke, disabled }, _ref) =>
    createElement(
      'button',
      {
        'data-testid': 'paper',
        disabled,
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
      const target = button(label);
      expect(target, label).toBeDefined();
      expect(target.disabled, label).toBe(false);
      await act(async () => target.click());
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
    expect(JSON.parse(screen.paper())).toEqual({ version: 2, pageId: 'flower', strokes: [] });
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
    expect(JSON.parse(screen.paper())).toEqual({ version: 2, pageId: 'flower', strokes: [] });
    await screen.click('Undo');
    expect(screen.paper()).toBe(original);
  });

  it('preserves the selected page through Clear and restores blank selection atomically with Undo', async () => {
    await screen.click('Coloring pages');
    await screen.click('Little turtle');
    await screen.click('Draw fixture stroke');
    const painted = screen.paper();
    await screen.click('Clear');
    expect(JSON.parse(screen.paper())).toEqual({ version: 2, pageId: 'turtle', strokes: [] });
    expect(screen.button('Clear').disabled).toBe(true);
    await screen.click('Undo');
    expect(screen.paper()).toBe(painted);
    await screen.click('Coloring pages');
    await screen.click('Blank paper');
    expect(JSON.parse(screen.paper())).toEqual(emptyDrawing());
    await screen.click('Undo');
    expect(screen.paper()).toBe(painted);
  });
});
