// @vitest-environment happy-dom
import {
  act,
  createElement,
  createRef,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { INITIAL_PNG_RECOVERY } from '../../experiments/native-architecture/src/export/pngRecovery.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const native = vi.hoisted(() => ({
  handlers: null,
  layout: null,
  frame: [],
  autoMeasure: true,
  measurements: [],
  scroll: null,
  notice: '',
  setNotice: null,
  contentChanges: 0,
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios' },
  Dimensions: { get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }) },
  ActivityIndicator: () => null,
  Modal: () => null,
  Pressable: ({ children }) => createElement('div', null, children),
  Text: ({ children, accessibilityLiveRegion }) =>
    createElement('span', { 'aria-live': accessibilityLiveRegion }, children),
  SafeAreaView: ({ children }) => createElement('div', null, children),
  ScrollView: ({ children, onScroll, onContentSizeChange }) => {
    if (onScroll) native.scroll = onScroll;
    const content = useRef(null);
    const previous = useRef(null);
    useLayoutEffect(() => {
      const text = content.current.textContent;
      if (previous.current !== null && previous.current !== text) {
        native.contentChanges += 1;
        onContentSizeChange?.(1024, text.length);
      }
      previous.current = text;
    });
    return createElement('div', { ref: content }, children);
  },
  findNodeHandle: (target) => target,
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: forwardRef(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        native.measurements.push(callback);
        if (native.autoMeasure) callback(...native.frame);
      },
    }));
    if (onLayout) native.layout = onLayout;
    return createElement('div', null, children);
  }),
}));
vi.mock('../../experiments/native-architecture/src/useDrawingScreen.ts', () => ({
  useDrawingScreen: () => {
    const [notice, setNotice] = useState(native.notice);
    const [drawing, setDrawing] = useState(false);
    native.setNotice = setNotice;
    return {
      history,
      setHistory: vi.fn(),
      clear: vi.fn(),
      undo: vi.fn(),
      pngRecovery: {
        state: INITIAL_PNG_RECOVERY,
        submit: vi.fn().mockResolvedValue(undefined),
        retry: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn().mockResolvedValue(undefined),
      },
      recovery: {
        generation: 0,
        failed: false,
        retry: vi.fn(),
        retryDisabled: false,
        callbacks: {
          onCohort: props.onCohort,
          onDrawingChange: (value) => {
            props.onDrawingChange(value);
            setDrawing(value);
          },
          onError: props.onError,
          onPreparingChange: vi.fn(),
          onRendererFault: vi.fn(),
        },
      },
      retryRenderer: vi.fn(),
      setPreparing: vi.fn(),
      reportRendererFault: vi.fn(),
      pagePickerOpen: false,
      setPagePickerOpen: vi.fn(),
      settingsOpen: false,
      colorPickerOpen: false,
      openColorPicker: vi.fn(),
      openSettings: vi.fn(),
      closeSettings: vi.fn(),
      color: props.color,
      setColor: vi.fn(),
      brush: props.brush,
      setBrush: vi.fn(),
      drawing,
      setDrawing: (value) => {
        props.onDrawingChange(value);
        setDrawing(value);
      },
      busy: false,
      notice,
      pictures: null,
      setPictures: vi.fn(),
      surface,
      disabled: false,
      report: props.onError,
      currentDrawing: props.currentDrawing,
      finishCohort: props.onCohort,
      save: vi.fn(),
      exportPicture: vi.fn(),
      showPictures: vi.fn(),
      openPicture: vi.fn(),
    };
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":false}'),
    write: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('react-native-svg', () => import('./native-contact-svg-harness.mjs'));

const PAPER_TARGET = 101;
const DENSITY = 2.75;
const BASELINE = {
  ...emptyDrawing(),
  strokes: [
    {
      color: 'Purple',
      brush: 'marker',
      width: 22,
      points: [
        { x: 470.71, y: 192 },
        { x: 553.29, y: 192 },
      ],
    },
  ],
};
function touch(identifier, x, y, timestamp, shiftX = 0, shiftY = 0) {
  return {
    identifier,
    locationX: (x - 44 - shiftX) / DENSITY,
    locationY: (y - 814 - shiftY) / DENSITY,
    pageX: x / DENSITY,
    pageY: y / DENSITY,
    target: PAPER_TARGET,
    timestamp,
  };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches])
    touchBank[item.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === item.identifier),
      startTimeStamp: starts[item.identifier] ?? item.timestamp,
      startPageX: item.pageX,
      startPageY: item.pageY,
      currentPageX: item.pageX,
      currentPageY: item.pageY,
      currentTimeStamp: item.timestamp,
      previousPageX: item.pageX,
      previousPageY: item.pageY,
      previousTimeStamp: item.timestamp,
    };
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank,
      numberActiveTouches: touches.length,
      indexOfSingleActiveTouch: touches[0]?.identifier ?? -1,
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}
let root;
let container;
let props;
let history;
let surface;
function send(callback, input) {
  act(() => {
    native.handlers[callback](input);
    if (
      callback === 'onPanResponderGrant' &&
      input.nativeEvent.changedTouches.some(
        (touch) =>
          input.touchHistory?.touchBank?.[touch.identifier]?.startTimeStamp === touch.timestamp
      )
    )
      native.handlers.onPanResponderStart(input);
  });
}
function layout() {
  act(() =>
    native.layout({
      nativeEvent: { layout: { x: 0, y: 0, width: native.frame[2], height: native.frame[3] } },
    })
  );
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(native, {
    handlers: null,
    layout: null,
    frame: [0, 0, 992 / DENSITY, 744 / DENSITY, 44 / DENSITY, 814 / DENSITY],
    autoMeasure: true,
    measurements: [],
    notice: '',
    setNotice: null,
    contentChanges: 0,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  history = addStrokes(createHistory(), BASELINE.strokes);
  props = {
    drawing: history.drawing,
    currentDrawing: () => history.drawing,
    color: 'Purple',
    brush: 'marker',
    strokeWidth: 'medium',
    eraserWidth: 'medium',
    disabled: false,
    onCohort: vi.fn((strokes) => {
      history = addStrokes(history, strokes);
    }),
    onDrawingChange: vi.fn(),
    onError: vi.fn(),
    onPreparingChange: vi.fn(),
    onRendererFault: vi.fn(),
  };
  surface = createRef();
  act(() => root.render(createElement(DrawingSurface, { ...props, ref: surface })));
  layout();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function pageTouch(identifier, pageX, pageY, timestamp, locationX = 1, locationY = 1) {
  return { identifier, locationX, locationY, pageX, pageY, target: PAPER_TARGET, timestamp };
}

function refresh() {
  act(() => surface.current.refreshGeometry());
}

export {
  native,
  root,
  container,
  props,
  history,
  BASELINE,
  touch,
  event,
  send,
  layout,
  pageTouch,
  refresh,
};
