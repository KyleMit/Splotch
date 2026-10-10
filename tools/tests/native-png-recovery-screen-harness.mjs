// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { strokeStyle } from '../../experiments/native-architecture/src/drawing/model.ts';

const files = vi.hoisted(() => ({
  list: vi.fn(),
  open: vi.fn(),
  lock: vi.fn(),
  capture: vi.fn(),
  ink: vi.fn(),
  export: vi.fn(),
  recoveryRead: vi.fn().mockResolvedValue(null),
  recoveryWrite: vi.fn().mockResolvedValue(undefined),
  settingsRead: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":false}'),
  settingsWrite: vi.fn().mockResolvedValue(undefined),
  cohort: null,
  cohortDrivers: false,
}));

vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: files.recoveryRead, write: files.recoveryWrite },
    deliver: async (picture) => {
      await files.export(picture.base64, picture.filename);
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
      accessibilityRole,
      'aria-pressed': pressed,
      style,
    }) =>
      createElement(
        'button',
        {
          onClick: onPress,
          disabled,
          'aria-label': accessibilityLabel,
          role: accessibilityRole,
          'aria-checked': accessibilityState?.checked,
          'aria-pressed': pressed,
          'data-native-selected': accessibilityState?.selected,
          style: Object.assign(
            {},
            ...[typeof style === 'function' ? style({ pressed: false }) : style]
              .flat(Infinity)
              .filter(Boolean)
          ),
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
  Defs: ({ children }) => createElement('defs', null, children),
  LinearGradient: ({ children }) => createElement('linearGradient', null, children),
  Stop: () => null,
  Rect: () => null,
  Path: () => null,
}));

export const STROKE = {
  color: 'Purple',
  brush: 'marker',
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
};

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(
    ({ drawing, onCohort, onDrawingChange, color, brush, disabled }, ref) => {
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
      files.cohort = onCohort;
      const cohort = () => [
        { ...strokeStyle(brush, color, drawing), points: STROKE.points },
        { ...strokeStyle('pencil', 'Blue', drawing), points: STROKE.points },
      ];
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            'data-testid': 'paper',
            disabled,
            'data-drawing': JSON.stringify(drawing),
            onClick: () =>
              onCohort([
                {
                  ...strokeStyle(brush, color, drawing),
                  points: STROKE.points,
                },
              ]),
          },
          'Draw fixture stroke'
        ),
        files.cohortDrivers
          ? createElement(
              'div',
              { 'data-fixture-cohort-drivers': true },
              createElement(
                'button',
                { onClick: () => onCohort(cohort()) },
                'Draw two-contact cohort'
              ),
              createElement('button', { onClick: () => onDrawingChange(true) }, 'Begin cohort'),
              createElement('button', { onClick: () => onDrawingChange(true) }, 'Lift one contact'),
              createElement(
                'button',
                {
                  onClick: () => {
                    onCohort(cohort());
                    onDrawingChange(false);
                  },
                },
                'Finish cohort'
              )
            )
          : null
      );
    }
  ),
}));

export function createScreen({ cohortDrivers = false } = {}) {
  files.cohortDrivers = cohortDrivers;
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

export const pictures = [
  { id: 'picture-1-bad', name: 'Broken picture', modifiedAt: 1 },
  { id: 'picture-2-good', name: 'Good picture', modifiedAt: 2 },
];

export { files };
