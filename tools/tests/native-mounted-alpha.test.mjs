import {
  paperProjection,
  drawingPaper,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
// @vitest-environment happy-dom
import { createPaperInputView } from './native-paper-fixtures.mjs';
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import './native-feedback-drawing-fixture.mjs';
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyDrawing,
  createHistory,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { parseDrawing } from '../../experiments/native-architecture/src/drawing/drawingFormat.ts';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import {
  DrawingSessionProvider,
  useDrawingHistory,
} from '../../experiments/native-architecture/src/product/DrawingSession.tsx';

const sdk = vi.hoisted(() => ({
  captures: [],
  hold: false,
  png: '',
  metrics: { width: 1024, height: 768, scale: 1, fontScale: 1 },
  dimensions: new Set(),
  frames: new Map(),
  next: 0,
  fail: false,
  load: true,
  imageLoads: [],
  inputs: [],
}));

vi.mock('../../experiments/native-architecture/src/platform/photoLibrary.ts', () => ({
  photoLibrary: null,
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
  const View = forwardRef(function View({ children, testID, onLayout }, ref) {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 1024, height: 768 } } });
    }, []);
    return createElement('div', { 'data-testid': testID }, children);
  });
  return {
    AccessibilityInfo: createAccessibilityInfoFixture(),
    BackHandler: { addEventListener: () => ({ remove() {} }), exitApp() {} },
    useColorScheme: () => 'light',
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    findNodeHandle: (target) => target,
    Dimensions: {
      get: () => sdk.metrics,
      addEventListener: (_, listener) => {
        sdk.dimensions.add(listener);
        return { remove: () => sdk.dimensions.delete(listener) };
      },
    },
    useWindowDimensions: () => sdk.metrics,
    Platform: { OS: 'android' },
    PixelRatio: { get: () => sdk.metrics.scale },
    // A decoded PNG reports its own grid, read from its IHDR chunk.
    Image: ({ source, onLoad }) => {
      useEffect(() => {
        const png = /^data:image\/png;base64,(.+)$/.exec(source.uri);
        const bytes = png ? Buffer.from(png[1], 'base64') : null;
        const grid = bytes
          ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
          : { width: 1024, height: 768 };
        onLoad({ nativeEvent: { source: { uri: source.uri, ...grid } } });
      }, [source.uri]);
      return null;
    },
    View,
    SafeAreaView: View,
    ScrollView: View,
    Text: ({ children }) => createElement('span', null, children),
    Modal: ({ visible, children }) =>
      visible ? createElement('div', { role: 'dialog' }, children) : null,
    Pressable: ({ children, accessibilityLabel, onPress, disabled }) =>
      createElement(
        'button',
        { 'aria-label': accessibilityLabel, onClick: onPress, disabled },
        children
      ),
    ActivityIndicator: () => null,
    StatusBar: () => null,
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => sdk.inputs.push(emit))
        : View,
  };
});
vi.mock('../../experiments/native-architecture/src/platform/animated.ts', async () => {
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  const { View } = await import('react-native');
  return { Animated: animatedPort(View, View), Easing: easingPort };
});

// The saved picture's compositor paints through Skia's native module, which Node cannot load;
// native-picture-export.test.mjs covers what it paints.
vi.mock('../../experiments/native-architecture/src/drawing/pictureCompose.ts', () => ({
  composePicture: async (layers) => layers.at(-1),
}));
vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: forwardRef(({ children }, ref) => {
      useImperativeHandle(ref, () => ({
        toDataURL(callback, options) {
          sdk.captures.push({ callback, options });
          if (sdk.fail) throw new Error('SDK capture failure');
          if (!sdk.hold) callback(sdk.png);
        },
      }));
      return createElement('div', null, children);
    }),
    G: group,
    Defs: group,
    Mask: group,
    Pattern: group,
    Filter: group,
    LinearGradient: group,
    Rect: () => null,
    Path: () => null,
    Circle: () => null,
    Stop: () => null,
    FeBlend: () => null,
    FeComposite: () => null,
    Image: ({ href, onLoad }) => {
      useEffect(() => {
        sdk.imageLoads.push(onLoad);
        if (sdk.load) onLoad?.();
      }, [href]);
      return null;
    },
  };
});

const fixture = parseDrawing({
  version: 3,
  pageId: 'flower',
  rainbow: 5,
  strokes: [
    { brush: 'magic', rainbow: 5, points: [{ x: 100, y: 100 }] },
    { brush: 'eraser', points: [{ x: 960, y: 740 }] },
  ],
});
const emptyPng = rgbaPng(1024, 768).toString('base64');
const paintedPng = rgbaPng(1024, 768, 4).toString('base64');
let host, root, state, session;
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.24);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  sdk.frames.clear();
  sdk.captures.length = 0;
  sdk.inputs.length = 0;
  sdk.imageLoads.length = 0;
  sdk.dimensions.clear();
  sdk.metrics = { width: 1024, height: 768, scale: 1, fontScale: 1 };
  sdk.fail = false;
  sdk.load = true;
  sdk.hold = false;
  sdk.png = paintedPng;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++sdk.next;
    sdk.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => sdk.frames.delete(id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
async function frames() {
  for (let index = 0; index < 10; index++)
    await act(async () => {
      const pending = [...sdk.frames.values()];
      sdk.frames.clear();
      pending.forEach((callback) => callback(0));
    });
}
async function decodeSettles() {
  await act(async () => vi.advanceTimersByTimeAsync(5000));
}
async function opened() {
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(HookSurface)))
  );
  await frames();
  await act(async () => session.setHistory(createHistory(fixture)));
  await frames();
}
async function saved() {
  await frames();
  return state.history.drawing;
}
async function clear() {
  await act(async () => {
    void state.clear();
  });
}
async function undo() {
  await act(async () => state.undo());
}
function HookSurface() {
  session = useDrawingHistory();
  state = useDrawingScreen();
  return createElement(DrawingSurface, {
    key: state.recovery.generation,
    ref: state.surface,
    drawing: state.history.drawing,
    projection: paperProjection(drawingPaper(state.history.drawing)),
    currentDrawing: state.currentDrawing,
    color: 'Purple',
    brush: state.brush,
    disabled: state.busy,
    ...state.recovery.callbacks,
  });
}
async function openHook() {
  await opened();
}

describe('mounted actual native Clear and decoder ownership', () => {
  it('clears once and Undo restores the old ink and page with the new active rainbow through rerenders', async () => {
    await opened();
    expect(await saved()).toEqual(fixture);
    await clear();
    expect(state.busy).toBe(true);
    await frames();
    await decodeSettles();
    expect(await saved()).toEqual(emptyDrawing(2, 'flower'));
    expect(state.recovery.failed).toBe(false);
    await undo();
    expect(state.busy).toBe(true);
    await frames();
    expect(await saved()).toEqual({ ...fixture, rainbow: 2 });
    expect(sdk.dimensions.size).toBe(0);
  });
  it('clears a visually blank recorded log without adding an Undo entry', async () => {
    await opened();
    sdk.png = emptyPng;
    await clear();
    await frames();
    await decodeSettles();
    expect(await saved()).toEqual(emptyDrawing(2, 'flower'));
    expect(state.history.undo).toEqual([]);
  });
  it('retains exact drawing and history on a dimension event before decoding', async () => {
    await opened();
    sdk.hold = true;
    await clear();
    await frames();
    const capture = sdk.captures.at(-1);
    expect(sdk.dimensions.size).toBe(1);
    sdk.metrics = { ...sdk.metrics, scale: 2 };
    await act(async () => sdk.dimensions.forEach((listener) => listener({ screen: sdk.metrics })));
    await act(async () => capture.callback(paintedPng));
    await decodeSettles();
    sdk.hold = false;
    expect(state.notice).toContain('The picture changed before capture finished.');
    expect(await saved()).toEqual(fixture);
    expect(sdk.dimensions.size).toBe(0);
    expect(state.recovery.failed).toBe(false);
    expect(state.history.undo).toEqual([]);
  });
  it('refuses a dimension change during cooperative decoding and retains the exact command snapshot', async () => {
    await openHook();
    const original = state.history;
    await act(async () => {
      void state.clear();
    });
    await frames();
    expect(state.busy).toBe(true);
    expect(sdk.dimensions.size).toBe(1);
    sdk.metrics = { ...sdk.metrics, width: 900 };
    await act(async () => sdk.dimensions.forEach((listener) => listener({ screen: sdk.metrics })));
    await decodeSettles();
    expect(state.history).toBe(original);
    expect(state.busy).toBe(false);
    expect(state.notice).toBe('Picture observation was cancelled. Your drawing is still here.');
    expect(sdk.dimensions.size).toBe(0);
  });
  it('keeps an unmounted decoder owned until its real finally before a replacement may decode', async () => {
    await openHook();
    await act(async () => {
      void state.clear();
    });
    await frames();
    expect(state.busy).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    await openHook();
    const replacement = state.history;
    await act(async () => {
      void state.clear();
    });
    await frames();
    expect(state.notice).toContain('still settling');
    expect(state.history).toBe(replacement);
    await decodeSettles();
    await act(async () => {
      void state.clear();
    });
    await frames();
    await decodeSettles();
    expect(state.history.drawing).toEqual(emptyDrawing(2, 'flower'));
  });
  it('refuses corrupt-tail Clear without converting failure into empty or offering renderer Retry', async () => {
    await opened();
    const png = Buffer.from(paintedPng, 'base64');
    png[png.length - 1] ^= 1;
    sdk.png = png.toString('base64');
    await clear();
    await frames();
    await decodeSettles();
    expect(state.notice).toContain('invalid or unsupported PNG');
    expect(await saved()).toEqual(fixture);
    expect(state.recovery.failed).toBe(false);
    expect(sdk.dimensions.size).toBe(0);
  });
  it('keeps the mounted imperative handle stable across command and packet rerenders', async () => {
    await openHook();
    const handle = state.surface.current;
    let saving;
    await act(async () => {
      saving = state.save();
    });
    await frames();
    await decodeSettles();
    // The saved picture's compositor loads on first use, so the save settles after its import.
    await act(async () => saving);
    expect(state.surface.current).toBe(handle);
    await act(async () => {
      void state.clear();
    });
    await frames();
    expect(state.surface.current).toBe(handle);
    await decodeSettles();
    expect(state.surface.current).toBe(handle);
    expect(state.history.drawing).toEqual(emptyDrawing(2, 'flower'));
  });
  it('refuses a duplicate command and remains locked through actual cooperative decode', async () => {
    await openHook();
    const clear = state.clear;
    sdk.hold = true;
    await act(async () => {
      void clear();
    });
    await frames();
    const count = sdk.captures.length;
    await act(async () => clear());
    expect(sdk.captures).toHaveLength(count);
    expect(state.busy).toBe(true);
    sdk.hold = false;
    await act(async () => sdk.captures.at(-1).callback(paintedPng));
    expect(state.busy).toBe(true);
    await decodeSettles();
    expect(state.busy).toBe(false);
    expect(state.history.drawing).toEqual(emptyDrawing(2, 'flower'));
  });
  it('cancels an old mounted request on unmount and ignores its late callback in a replacement owner', async () => {
    await openHook();
    const original = state.history;
    sdk.hold = true;
    await act(async () => {
      void state.clear();
    });
    await frames();
    const old = sdk.captures.at(-1);
    act(() => root.unmount());
    expect(sdk.dimensions.size).toBe(0);
    root = createRoot(host);
    sdk.hold = false;
    await act(async () => root.render(createElement(HookSurface)));
    await act(async () => old.callback(paintedPng));
    await decodeSettles();
    expect(state.history.drawing).toEqual(emptyDrawing(2));
    expect(original.drawing).toEqual(fixture);
  });
  it('recovers a real main-renderer fault through its current recovery owner, refuses the old callback and then permits Clear', async () => {
    sdk.fail = true;
    await opened();
    const old = sdk.captures[0];
    expect(state.recovery.failed).toBe(true);
    sdk.fail = false;
    await act(async () => state.recovery.retry());
    await frames();
    await act(async () => old.callback('late-invalid-png'));
    expect(await saved()).toEqual(fixture);
    await clear();
    await frames();
    await decodeSettles();
    expect(await saved()).toEqual(emptyDrawing(2, 'flower'));
    await undo();
    expect(state.busy).toBe(true);
    await frames();
    expect(await saved()).toEqual({ ...fixture, rainbow: 2 });
  });
  it('rejects a superseded current-drawing capture and allows the same stable owner to capture its replacement', async () => {
    const ref = { current: null },
      props = {
        drawing: fixture,
        projection: paperProjection(drawingPaper(fixture)),
        currentDrawing: () => props.drawing,
        color: 'Purple',
        brush: 'marker',
        disabled: false,
        onCohort: vi.fn(),
        onDrawingChange: vi.fn(),
        onPreparingChange: vi.fn(),
        onError: vi.fn(),
        onRendererFault: vi.fn(),
      };
    await act(async () => root.render(createElement(DrawingSurface, { ...props, ref })));
    await frames();
    const handle = ref.current,
      release = handle.lockInput();
    sdk.hold = true;
    let pending;
    await act(async () => {
      pending = handle.captureInk(fixture);
    });
    const rejected = (async () => {
      await expect(pending).rejects.toThrow('changed');
    })();
    await frames();
    const old = sdk.captures.at(-1);
    const replacement = emptyDrawing(2, 'turtle');
    props.drawing = replacement;
    props.projection = paperProjection(drawingPaper(replacement));
    await act(async () =>
      root.render(createElement(DrawingSurface, { ...props, drawing: replacement, ref }))
    );
    await rejected;
    expect(ref.current).toBe(handle);
    release();
    await act(async () => old.callback(paintedPng));
    sdk.hold = false;
    const releaseNext = handle.lockInput();
    let next;
    await act(async () => {
      next = handle.captureInk(replacement);
    });
    await frames();
    await expect(next).resolves.toMatchObject({
      base64: paintedPng,
      size: { width: 1024, height: 768 },
    });
    releaseNext();
    expect(props.onRendererFault).not.toHaveBeenCalled();
  });
});

vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);

vi.mock('../../experiments/native-architecture/src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
