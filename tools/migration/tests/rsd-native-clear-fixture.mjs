import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { vi } from 'vitest';
import { caller, records, host, mount } from './rsd-native-selection-host.mjs';
import { RsdDrawingScreen } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDrawingScreen.tsx';
import {
  emptyDrawing,
  strokeStyle,
} from '../../../experiments/native-architecture/src/drawing/model.ts';
import { acceptRadius } from '../../../experiments/native-architecture/src/clear/dragToClear.ts';
import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';

const runtimeRequire = createRequire(import.meta.url);
const presetRequire = createRequire(runtimeRequire.resolve('@react-native/babel-preset'));
const babel = presetRequire('@babel/core');

function loadNativeTransformOrigin() {
  const source = runtimeRequire.resolve(
    'react-native/Libraries/StyleSheet/processTransformOrigin.js'
  );
  const { code } = babel.transformSync(readFileSync(source, 'utf8'), {
    babelrc: false,
    configFile: false,
    plugins: [
      presetRequire.resolve('babel-plugin-syntax-hermes-parser'),
      presetRequire.resolve('@babel/plugin-transform-flow-strip-types'),
      presetRequire.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__DEV__', code)(
    createRequire(source),
    module,
    module.exports,
    true
  );
  return module.exports.default;
}

export const processNativeTransformOrigin = loadNativeTransformOrigin();
export const preprocessWebStyle = runtimeRequire(
  'react-native-web/dist/cjs/exports/StyleSheet/preprocess'
).preprocess;

// The Clear Button suites' screen, mount and responder helpers.
// The fixture window is 402 wide, so the shipping accept radius is 40% of that, and the docked
// tab's centre is 20px in from its right edge and 120px down.
export const HOME = { x: 382, y: 120 };
export const radius = () => acceptRadius(records.dimensions.width, records.dimensions.height);

export function inkedDrawing() {
  const drawing = emptyDrawing();
  const stroke = {
    ...strokeStyle('pen', 'Purple', drawing),
    points: [
      { x: 20, y: 20 },
      { x: 100, y: 100 },
    ],
  };
  return { ...drawing, paper: canonicalPaper(), strokes: [stroke] };
}

// `drawing` names the picture on the paper; the screen's own `drawing` flag, a stroke in progress,
// stays false.
export function clearScreen({ drawing = inkedDrawing(), ...overrides } = {}) {
  return {
    notice: '',
    drawing: false,
    disabled: false,
    brush: 'pen',
    brushControl: { kind: 'none' },
    availableBrushes: ['pen'],
    history: { undo: [], drawing },
    inkVisible: drawing.strokes.length > 0,
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    undo: vi.fn(),
    clear: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    setPagePickerOpen: vi.fn(),
    openSettings: vi.fn(),
    openColorPicker: vi.fn(),
    toggleBrush: vi.fn(),
    selectInkBrush: vi.fn(),
    ...overrides,
  };
}

export async function mountClear({
  sound = true,
  level,
  saveOnDelete,
  reduceMotion = false,
  ...screen
} = {}) {
  records.reduceMotion = reduceMotion;
  caller.screen = clearScreen(screen);
  caller.menu = { open: false, visible: false, show: vi.fn() };
  caller.sound = {
    settings: {
      status: 'ready',
      soundEnabled: sound,
      appearance: 'light',
      selectedColor: 'Purple',
      customColors: [],
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      aiEnabled: false,
    },
  };
  if (level || saveOnDelete !== undefined) {
    const stored = {
      version: 9,
      soundEnabled: sound,
      soundLevel: level ?? 'medium',
      coloringBookEnabled: true,
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      orientation: 'portrait',
      saveOnDeleteEnabled: saveOnDelete ?? false,
    };
    caller.settingsStorage = {
      read: async () => JSON.stringify({ ...JSON.parse(caller.initialSettings), ...stored }),
      write: async () => {},
    };
  }
  await mount(createElement(RsdDrawingScreen));
}

export const clearProps = () =>
  records.props.findLast((props) => props.accessibilityLabel === 'Clear drawing');
// React Native responder events: the changed touch at the top level, every touch in the lists.
export const CLEAR_FINGER = 1;
export const PAPER_FINGER = 2;
export const touch = (identifier, point) => ({ identifier, pageX: point.x, pageY: point.y });
export function responderEvent(changed, touches) {
  const [first] = changed;
  return { nativeEvent: { ...first, changedTouches: changed, touches } };
}
const at = (point) => responderEvent([touch(CLEAR_FINGER, point)], [touch(CLEAR_FINGER, point)]);
export const offset = (distance) => ({
  x: HOME.x - distance / Math.SQRT2,
  y: HOME.y + distance / Math.SQRT2,
});

export async function press(point = HOME) {
  await act(async () => {
    if (clearProps().onStartShouldSetResponder()) clearProps().onResponderGrant(at(point));
  });
}
export async function drag(point) {
  await act(async () => clearProps().onResponderMove(at(point)));
}
export async function lift(point) {
  await act(async () => clearProps().onResponderRelease(at(point)));
}
export async function settle(ms) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

export const rendered = (testID) => host.querySelector(`[data-testid="${testID}"]`) !== null;
export const everRendered = (testID) => records.props.some((props) => props.testID === testID);
export const clearIcon = () =>
  host.querySelector('[aria-label="Clear drawing"] svg[data-xml]').dataset.xml;

export const layout = (testID, box) =>
  act(async () =>
    records.props
      .findLast((props) => props.testID === testID)
      .onLayout({ nativeEvent: { layout: box } })
  );

export async function commitClear() {
  await press();
  await drag(offset(radius() + 10));
  await lift(offset(radius() + 10));
  await act(async () => {});
}
