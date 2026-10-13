// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import './native-feedback-drawing-fixture.mjs';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { act, createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import {
  parseDrawing,
  addStrokes,
  createHistory,
  emptyDrawing,
} from '../../experiments/native-architecture/src/drawing/model.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';
import {
  adoptPaper,
  LEGACY_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { useRendererRecovery } from '../../experiments/native-architecture/src/useRendererRecovery.ts';

const capturePngFixture = readFileSync(
  new NodeURL('./fixtures/native-png-android-rgba-sbit.png', import.meta.url)
).toString('base64');

const sdk = vi.hoisted(() => ({
  captures: [],
  frames: new Map(),
  next: 0,
  fail: false,
  load: true,
  imageLoads: [],
  responders: [],
  save: vi.fn(),
  open: vi.fn(),
  export: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async (picture) => {
      await sdk.export(picture.base64);
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
  listPictures: () => [{ id: 'picture-1-recovery', name: 'Recovery fixture', modifiedAt: 1 }],
  reopenPicture: sdk.open,
  savePicture: sdk.save,
  exportPng: sdk.export,
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => ({
  drawingDraftStorage: { read: async () => null, write: async () => {} },
  protectedDraftPageIds: async () => [],
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":false}'),
    write: vi.fn(),
  },
}));

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
    PixelRatio: { get: () => 1 },
    AccessibilityInfo: createAccessibilityInfoFixture(),
    useColorScheme: () => 'light',
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    Platform: { OS: 'web' },
    Image: () => null,
    findNodeHandle: (target) => target,
    View,
    SafeAreaView: View,
    ScrollView: View,
    Text: ({ children }) => createElement('span', null, children),
    Modal: ({ visible, children, onDismiss }) => {
      const shown = useRef(false);
      useEffect(() => {
        if (!visible && shown.current) onDismiss?.();
        shown.current = visible;
      }, [visible, onDismiss]);
      return visible ? createElement('div', { role: 'dialog' }, children) : null;
    },
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
        toDataURL(callback) {
          sdk.captures.push(callback);
          if (sdk.fail) throw new Error('SDK capture failure');
          callback(capturePngFixture);
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
    Use: () => null,
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
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  sdk.frames.clear();
  sdk.captures.length = 0;
  sdk.responders.length = 0;
  sdk.fail = false;
  sdk.load = true;
  sdk.imageLoads.length = 0;
  sdk.open.mockResolvedValue(fixture);
  sdk.save.mockResolvedValue(undefined);
  sdk.export.mockResolvedValue(undefined);
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
  if (['Pictures', 'Save picture', 'Clear', 'Export PNG'].includes(label) && !button(label))
    await openTools();
  const target = button(label);
  expect(target, label).toBeDefined();
  expect(target.disabled, label).toBe(false);
  await act(async () => target.click());
}
async function frames() {
  for (let count = 0; count < 10; count += 1)
    await act(async () => {
      const pending = [...sdk.frames.values()];
      sdk.frames.clear();
      pending.forEach((callback) => callback(0));
    });
}

describe('visible terminal renderer recovery', () => {
  it('retries the actual DrawingSurface/RasterInk failure through the real button and retains canonical page/rainbow/history', async () => {
    await act(async () => root.render(createElement(DrawingScreen)));
    await click('Pictures');
    sdk.fail = true;
    await click('Open picture from Recovery fixture');
    await frames();
    expect(host.textContent).toContain('PNG capture failed. Your picture is still here.');
    expect(button('Save picture')).toBeUndefined();
    expect(toolsButton().disabled).toBe(true);
    expect(button('Retry drawing').disabled).toBe(false);
    const before = sdk.captures.length,
      late = sdk.captures[0];
    sdk.fail = false;
    await click('Retry drawing');
    await frames();
    expect(button('Retry drawing')).toBeUndefined();
    expect(sdk.captures.length).toBeGreaterThan(before);
    await act(async () => late('old-generation-png'));
    await click('Save picture');
    expect(sdk.save).toHaveBeenLastCalledWith(fixture);
    expect(sdk.save.mock.calls.at(-1)[0]).toBe(fixture);
    await act(async () => toolsButton().click());
    expect(button('Save picture').disabled).toBe(false);
    expect(host.textContent).toContain('Garden flower');
    await click('Keep drawing');
    const paper = host.querySelector('[data-testid="drawing-paper"]');
    const input = sdk.responders[Number(paper.getAttribute('data-responder'))];
    const touch = {
      identifier: 'new-contact',
      locationX: 200,
      locationY: 200,
      pageX: 200,
      pageY: 200,
      target: 101,
      timestamp: 100,
    };
    const event = {
      currentTarget: 101,
      nativeEvent: { changedTouches: [touch], touches: [touch], target: 101 },
      touchHistory: {
        touchBank: { 'new-contact': { touchActive: true, startTimeStamp: 100 } },
        mostRecentTimeStamp: 100,
      },
    };
    const end = {
      currentTarget: 101,
      nativeEvent: { changedTouches: [{ ...touch, timestamp: 200 }], touches: [], target: 101 },
      touchHistory: {
        touchBank: { 'new-contact': { touchActive: false, startTimeStamp: 100 } },
        mostRecentTimeStamp: 200,
      },
    };
    expect(input.onStartShouldSetPanResponder()).toBe(true);
    await act(async () => {
      input.onPanResponderGrant(event);
      input.onPanResponderStart(event);
      input.onPanResponderEnd(end);
      input.onPanResponderRelease(end);
    });
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0].strokes).toHaveLength(3);
    await click('Undo');
    await click('Save picture');
    expect(sdk.save).toHaveBeenLastCalledWith(fixture);
    expect(sdk.save.mock.calls.at(-1)[0]).toBe(fixture);
    await click('Undo');
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0]).toMatchObject({
      pageId: 'blank',
      rainbow: 0,
      strokes: [],
    });
  });
  it('keeps Retry visible after another real terminal failure without an automatic remount loop', async () => {
    await act(async () => root.render(createElement(DrawingScreen)));
    await click('Pictures');
    sdk.fail = true;
    await click('Open picture from Recovery fixture');
    await frames();
    expect(sdk.captures).toHaveLength(1);
    await click('Retry drawing');
    await frames();
    expect(sdk.captures).toHaveLength(2);
    expect(button('Retry drawing').disabled).toBe(false);
    await frames();
    expect(sdk.captures).toHaveLength(2);
  });
  it('keeps the recovered renderer locked until its own image load and ignores an old image callback', async () => {
    await act(async () => root.render(createElement(DrawingScreen)));
    sdk.load = false;
    await click('Pictures');
    await click('Open picture from Recovery fixture');
    await frames();
    const oldImage = sdk.imageLoads.at(-1);
    await act(async () => vi.advanceTimersByTime(PNG_TIMEOUT_MS));
    expect(button('Retry drawing').disabled).toBe(false);
    await click('Retry drawing');
    await frames();
    expect(button('Save picture')).toBeUndefined();
    expect(toolsButton().disabled).toBe(true);
    await act(async () => oldImage());
    expect(button('Save picture')).toBeUndefined();
    expect(toolsButton().disabled).toBe(true);
    await act(async () => sdk.imageLoads.at(-1)());
    await frames();
    expect(toolsButton().disabled).toBe(false);
    expect(host.textContent).toContain('Your picture is ready.');
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0]).toBe(fixture);
  });
  it('does not offer renderer Retry for an ordinary export failure', async () => {
    sdk.export.mockRejectedValue(new Error('Sharing was declined'));
    await act(async () => root.render(createElement(DrawingScreen)));
    await click('Export PNG');
    await frames();
    await act(async () => vi.runAllTimersAsync());
    expect(host.textContent).toContain('Sharing was declined');
    expect(button('Retry drawing')).toBeUndefined();
  });
});

describe('generation and real input/command admission', () => {
  function harness() {
    let recovery;
    const rendererFault = { current: false },
      command = { current: false };
    const release = vi.fn(),
      lockInput = vi.fn(() => release);
    const options = {
      rendererFault,
      command,
      blocked: false,
      surface: { current: { lockInput } },
      setPreparing: vi.fn(),
      setDrawing: vi.fn(),
      finishCohort: vi.fn(),
      report: vi.fn(),
      setNotice: vi.fn(),
    };
    function Consumer() {
      recovery = useRendererRecovery(options);
      return null;
    }
    act(() => root.render(createElement(Consumer)));
    return {
      options,
      release,
      lockInput,
      get: () => recovery,
      render: () => act(() => root.render(createElement(Consumer))),
    };
  }
  it('ignores every old renderer callback and a duplicate Retry before React commits', () => {
    const h = harness(),
      old = h.get();
    act(() => old.callbacks.onRendererFault(new Error('fault')));
    const retry = h.get().retry;
    act(() => {
      retry();
      retry();
    });
    expect(h.lockInput).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.get().generation).toBe(1);
    const counts = [h.options.setPreparing.mock.calls.length, h.options.report.mock.calls.length];
    act(() => {
      old.callbacks.onPreparingChange(false);
      old.callbacks.onRendererFault(new Error('late'));
      old.callbacks.onDrawingChange(true);
      old.callbacks.onCohort([fixture.strokes[0]], LEGACY_PAPER);
      old.callbacks.onError(new Error('late ordinary'));
    });
    expect(h.options.setPreparing).toHaveBeenCalledTimes(counts[0]);
    expect(h.options.report).toHaveBeenCalledTimes(counts[1]);
    expect(h.options.setDrawing).not.toHaveBeenCalled();
    expect(h.options.finishCohort).not.toHaveBeenCalled();
    act(() => h.get().callbacks.onPreparingChange(false));
    expect(h.options.setPreparing).toHaveBeenLastCalledWith(false);
  });
  it('forwards the identical adopted paper atomically and refuses its stale generation and unmounted callbacks', () => {
    const h = harness();
    const paper = adoptPaper(342, 256.5, 1);
    const strokes = [{ brush: 'pen', color: 'Red', width: 22, points: [{ x: 200, y: 300 }] }];
    const initial = createHistory(emptyDrawing());
    let history = initial;
    h.options.finishCohort.mockImplementation((ink, reference) => {
      history = addStrokes(history, ink, reference);
    });
    const old = h.get();
    act(() => old.callbacks.onCohort(strokes, paper));
    expect(h.options.finishCohort).toHaveBeenLastCalledWith(strokes, paper);
    expect(h.options.finishCohort.mock.calls[0][0]).toBe(strokes);
    expect(h.options.finishCohort.mock.calls[0][1]).toBe(paper);
    expect(history.drawing.paper).toBe(paper);
    expect(history.undo).toEqual([initial.drawing]);
    const committed = history;
    act(() => old.callbacks.onRendererFault(new Error('fault')));
    act(() => h.get().retry());
    act(() => old.callbacks.onCohort(strokes, paper));
    expect(history).toBe(committed);
    expect(h.options.finishCohort).toHaveBeenCalledOnce();
    const current = h.get();
    act(() => current.callbacks.onCohort(strokes, paper));
    expect(h.options.finishCohort).toHaveBeenCalledTimes(2);
    expect(history.drawing.paper).toBe(paper);
    const afterRetry = history;
    act(() => root.render(null));
    act(() => current.callbacks.onCohort(strokes, paper));
    expect(history).toBe(afterRetry);
    expect(h.options.finishCohort).toHaveBeenCalledTimes(2);
  });
  it('refuses command/modal admission and an actual active-contact lock failure without losing the fault', () => {
    const h = harness();
    act(() => h.get().callbacks.onRendererFault(new Error('fault')));
    h.options.command.current = true;
    act(() => h.get().retry());
    expect(h.lockInput).not.toHaveBeenCalled();
    h.options.command.current = false;
    h.options.blocked = true;
    h.render();
    act(() => h.get().retry());
    expect(h.lockInput).not.toHaveBeenCalled();
    h.options.blocked = false;
    h.render();
    h.lockInput.mockImplementationOnce(() => {
      throw new Error('active contact');
    });
    act(() => h.get().retry());
    expect(h.get().generation).toBe(0);
    expect(h.get().failed).toBe(true);
    expect(h.options.rendererFault.current).toBe(true);
    expect(h.options.report).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'active contact' })
    );
  });
});

vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);

vi.mock('../../experiments/native-architecture/src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
