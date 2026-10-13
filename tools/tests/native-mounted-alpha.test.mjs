// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import './native-feedback-drawing-fixture.mjs';
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import {
  emptyDrawing,
  parseDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import {
  decodeDrawingDraft,
  encodeDrawingDraft,
} from '../../experiments/native-architecture/src/product/drawingDraft.ts';
import { DrawingSessionProvider } from '../../experiments/native-architecture/src/product/DrawingSession.tsx';

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
  responders: [],
  save: vi.fn(),
  draft: null,
  drafts: [],
}));
vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async () => {
      return 'sharing-closed';
    },
  },
}));

// Save picture is this suite's probe of the current drawing; the photo library copy it also
// makes is covered by native-save-to-photos-mounted.test.mjs.
vi.mock('../../experiments/native-architecture/src/platform/photoLibrary.ts', () => ({
  photoLibrary: null,
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: sdk.save,
  savedColoringPageIds: async () => [],
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
vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => {
  const storage = {
    read: async () => sdk.draft,
    write: async (snapshot) => {
      sdk.drafts.push(snapshot);
    },
  };
  return {
    drawingDraftStorage: storage,
    protectedDraftPageIds: async () => [],
  };
});
vi.mock('react-native', () => {
  const View = forwardRef(function View({ children, testID, onLayout, responderIndex }, ref) {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(0, 0, 1024, 768, 0, 0) }));
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 1024, height: 768 } } });
    }, []);
    return createElement(
      'div',
      { 'data-testid': testID, 'data-responder': responderIndex },
      children
    );
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
    Image: ({ source, onLoad }) => {
      useEffect(
        () => onLoad({ nativeEvent: { source: { uri: source.uri, width: 1024, height: 768 } } }),
        [source.uri]
      );
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
    PanResponder: {
      create: (handlers) => {
        sdk.responders.push(handlers);
        return { panHandlers: { responderIndex: sdk.responders.length - 1 } };
      },
    },
  };
});
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
let host, root, state;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  sdk.frames.clear();
  sdk.captures.length = 0;
  sdk.responders.length = 0;
  sdk.imageLoads.length = 0;
  sdk.dimensions.clear();
  sdk.metrics = { width: 1024, height: 768, scale: 1, fontScale: 1 };
  sdk.fail = false;
  sdk.load = true;
  sdk.hold = false;
  sdk.png = paintedPng;
  sdk.draft = null;
  sdk.drafts.length = 0;
  sdk.save.mockResolvedValue(undefined);
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
});
function button(label) {
  return [...host.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === label
  );
}
function toolsButton() {
  return [...host.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label') === 'Drawing tools'
  );
}
async function openTools() {
  const opener = toolsButton();
  expect(opener, 'Drawing tools opener').toBeDefined();
  expect(opener.disabled, 'Drawing tools admission').toBe(false);
  await act(async () => opener.click());
}
async function click(label) {
  if (['Clear'].includes(label) && !button(label)) await openTools();
  const target = button(label);
  expect(target, label).toBeDefined();
  expect(target.disabled, label).toBe(false);
  await act(async () => target.click());
}
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
// The fixture opens as the restored current-picture draft (sdk.draft), read once on load; the
// drafts the screen writes after (sdk.drafts) show what it holds.
async function restoring(render) {
  sdk.draft = encodeDrawingDraft(fixture);
  await act(async () => root.render(createElement(DrawingSessionProvider, null, render)));
  await frames();
  sdk.draft = null;
}
async function opened() {
  await restoring(createElement(DrawingScreen));
}
async function saved() {
  await frames();
  return decodeDrawingDraft(sdk.drafts.at(-1) ?? encodeDrawingDraft(fixture));
}
function HookSurface() {
  state = useDrawingScreen();
  return createElement(DrawingSurface, {
    key: state.recovery.generation,
    ref: state.surface,
    drawing: state.history.drawing,
    currentDrawing: state.currentDrawing,
    color: state.color,
    brush: state.brush,
    disabled: state.busy,
    ...state.recovery.callbacks,
  });
}
async function openHook() {
  await restoring(createElement(HookSurface));
}

describe('mounted actual native Clear and decoder ownership', () => {
  it('clears observed ink once and Undo restores exact page/rainbow/drawing identity through rerenders', async () => {
    await opened();
    expect(await saved()).toEqual(fixture);
    await click('Clear');
    expect(button('Save picture')).toBeUndefined();
    expect(toolsButton().disabled).toBe(true);
    await frames();
    await decodeSettles();
    expect(await saved()).toEqual(emptyDrawing(6, 'flower'));
    expect(button('Retry drawing')).toBeUndefined();
    await click('Undo');
    expect(toolsButton().disabled).toBe(true);
    await frames();
    expect(await saved()).toEqual(fixture);
    expect(sdk.dimensions.size).toBe(0);
  });
  it('clears a visually blank recorded log without adding an Undo entry', async () => {
    await opened();
    sdk.png = emptyPng;
    await click('Clear');
    await frames();
    await decodeSettles();
    expect(await saved()).toEqual(emptyDrawing(6, 'flower'));
    // The restored picture is the first in this history, so Clear leaves nothing to Undo.
    expect(button('Undo').disabled).toBe(true);
  });
  it('retains exact drawing and history on a dimension event before decoding', async () => {
    await opened();
    sdk.hold = true;
    await click('Clear');
    await frames();
    const capture = sdk.captures.at(-1);
    expect(sdk.dimensions.size).toBe(1);
    sdk.metrics = { ...sdk.metrics, scale: 2 };
    await act(async () => sdk.dimensions.forEach((listener) => listener({ screen: sdk.metrics })));
    await act(async () => capture.callback(paintedPng));
    await decodeSettles();
    sdk.hold = false;
    expect(host.textContent).toContain('The picture changed before observation finished.');
    expect(await saved()).toEqual(fixture);
    expect(sdk.dimensions.size).toBe(0);
    expect(button('Retry drawing')).toBeUndefined();
    expect(button('Undo').disabled).toBe(true);
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
    expect(state.history.drawing).toEqual(emptyDrawing(6, 'flower'));
  });
  it('refuses corrupt-tail Clear without converting failure into empty or offering renderer Retry', async () => {
    await opened();
    const png = Buffer.from(paintedPng, 'base64');
    png[png.length - 1] ^= 1;
    sdk.png = png.toString('base64');
    await click('Clear');
    await frames();
    await decodeSettles();
    expect(host.textContent).toContain('invalid or unsupported PNG');
    expect(await saved()).toEqual(fixture);
    expect(button('Retry drawing')).toBeUndefined();
    expect(sdk.dimensions.size).toBe(0);
  });
  it('keeps the mounted imperative handle stable across command and packet rerenders', async () => {
    await openHook();
    const handle = state.surface.current;
    await act(async () => {
      void state.save();
    });
    await frames();
    await decodeSettles();
    expect(state.surface.current).toBe(handle);
    await act(async () => {
      void state.clear();
    });
    await frames();
    expect(state.surface.current).toBe(handle);
    await decodeSettles();
    expect(state.surface.current).toBe(handle);
    expect(state.history.drawing).toEqual(emptyDrawing(6, 'flower'));
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
    expect(state.history.drawing).toEqual(emptyDrawing(6, 'flower'));
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
    expect(state.history.drawing).toEqual(emptyDrawing());
    expect(original.drawing).toEqual(fixture);
  });
  it('recovers a real main-renderer fault via visible Retry, refuses the old callback and then permits Clear', async () => {
    sdk.fail = true;
    await opened();
    const old = sdk.captures[0];
    expect(button('Retry drawing').disabled).toBe(false);
    sdk.fail = false;
    await click('Retry drawing');
    await frames();
    await act(async () => old.callback('late-invalid-png'));
    expect(await saved()).toEqual(fixture);
    await click('Clear');
    await frames();
    await decodeSettles();
    expect(await saved()).toEqual(emptyDrawing(6, 'flower'));
    await click('Undo');
    expect(toolsButton().disabled).toBe(true);
    await frames();
    expect(await saved()).toEqual(fixture);
  });
  it('rejects a superseded current-drawing capture and allows the same stable owner to capture its replacement', async () => {
    const ref = { current: null },
      props = {
        drawing: fixture,
        currentDrawing: () => fixture,
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
    await expect(next).resolves.toBe(paintedPng);
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
