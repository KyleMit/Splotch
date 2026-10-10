// @vitest-environment happy-dom
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProbeApp as DrawingScreen } from '../../experiments/native-architecture/src/ProbeApp.tsx';
import { parseDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { PNG_TIMEOUT_MS } from '../../experiments/native-architecture/src/drawing/svgCapture.ts';

const sdk = vi.hoisted(() => ({
  captures: [],
  scene: 0,
  appState: new Set(),
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
vi.mock('../../experiments/native-architecture/src/DrawingScreen.tsx', async (original) => {
  const actual = await original();
  return {
    DrawingScreen: (props) => createElement(actual.DrawingScreen, { ...props, key: sdk.scene }),
  };
});
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: () => [{ id: 'picture-1-recovery', name: 'Recovery fixture', modifiedAt: 1 }],
  reopenPicture: sdk.open,
  savePicture: sdk.save,
  exportPng: sdk.export,
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
    AppState: {
      currentState: 'active',
      addEventListener: (_event, listener) => {
        sdk.appState.add(listener);
        return { remove: () => sdk.appState.delete(listener) };
      },
    },
    Platform: { OS: 'web' },
    Image: () => null,
    findNodeHandle: (target) => target,
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
          callback('transparent-fixture-png');
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
  sdk.scene = 0;
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
async function click(label) {
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
  it('recovers a surviving raster fault during suspension and preserves every Undo step', async () => {
    await act(async () => root.render(createElement(DrawingScreen)));
    await click('Coloring pages');
    await click('Sunshine');
    await frames();
    sdk.load = false;
    const loadedImages = sdk.imageLoads.length;
    await click('Pictures');
    await click('Open picture from Recovery fixture');
    await frames();
    expect(sdk.imageLoads.length).toBeGreaterThan(loadedImages);
    expect(button('Save picture').disabled).toBe(true);
    const paper = host.querySelector('[data-testid="drawing-paper"]');
    await act(async () => {
      for (const notify of sdk.appState) notify('background');
    });
    await act(async () => vi.advanceTimersByTime(PNG_TIMEOUT_MS));
    expect(button('Retry drawing').disabled).toBe(true);
    await act(async () => {
      for (const notify of sdk.appState) notify('active');
    });
    expect(host.querySelector('[data-testid="drawing-paper"]')).toBe(paper);
    expect(button('Retry drawing')).toBeDefined();
    expect(button('Retry drawing').disabled).toBe(false);
    sdk.load = true;
    await click('Retry drawing');
    await frames();
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0]).toBe(fixture);
    await click('Undo');
    await frames();
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0]).toMatchObject({ pageId: 'sunshine', strokes: [] });
    await click('Undo');
    await frames();
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0]).toMatchObject({
      pageId: 'blank',
      rainbow: 0,
      strokes: [],
    });
    expect(button('Undo').disabled).toBe(true);
  });
  it('retries the actual DrawingSurface/RasterInk failure through the real button and retains canonical page/rainbow/history', async () => {
    await act(async () => root.render(createElement(DrawingScreen)));
    await click('Pictures');
    sdk.fail = true;
    await click('Open picture from Recovery fixture');
    await frames();
    expect(host.textContent).toContain('PNG capture failed. Your picture is still here.');
    expect(button('Save picture').disabled).toBe(true);
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
    expect(host.textContent).toContain('Garden flower');
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
    expect(button('Save picture').disabled).toBe(true);
    await act(async () => oldImage());
    expect(button('Save picture').disabled).toBe(true);
    await act(async () => sdk.imageLoads.at(-1)());
    await frames();
    expect(button('Save picture').disabled).toBe(false);
    expect(host.textContent).toContain('Your picture is ready.');
    await click('Save picture');
    expect(sdk.save.mock.calls.at(-1)[0]).toBe(fixture);
  });
  it('does not offer renderer Retry for an ordinary export failure', async () => {
    sdk.export.mockRejectedValue(new Error('Sharing was declined'));
    await act(async () => root.render(createElement(DrawingScreen)));
    await click('Export PNG');
    await frames();
    expect(host.textContent).toContain('Sharing was declined');
    expect(button('Retry drawing')).toBeUndefined();
  });
});

it('flushes accepted input exactly once before real scene teardown and retains its Undo entries', async () => {
  await act(async () => root.render(createElement(DrawingScreen)));
  await frames();
  const paper = host.querySelector('[data-testid="drawing-paper"]');
  const input = sdk.responders[Number(paper.getAttribute('data-responder'))];
  function event(identifier, timestamp, ended = false) {
    const touch = {
      identifier,
      locationX: 200,
      locationY: 200,
      pageX: 200,
      pageY: 200,
      target: 101,
      timestamp,
    };
    return {
      currentTarget: 101,
      nativeEvent: { changedTouches: [touch], touches: ended ? [] : [touch], target: 101 },
      touchHistory: {
        touchBank: {
          [identifier]: { touchActive: !ended, startTimeStamp: identifier === 'first' ? 100 : 300 },
        },
        mostRecentTimeStamp: timestamp,
      },
    };
  }
  await act(async () => {
    const start = event('first', 100);
    input.onPanResponderGrant(start);
    input.onPanResponderStart(start);
    const end = event('first', 200, true);
    input.onPanResponderEnd(end);
    input.onPanResponderRelease(end);
  });
  await frames();
  await act(async () => {
    const start = event('second', 300);
    input.onPanResponderGrant(start);
    input.onPanResponderStart(start);
  });
  sdk.scene += 1;
  await act(async () => root.render(createElement(DrawingScreen)));
  expect(paper.isConnected).toBe(false);
  await frames();
  await act(async () => {
    input.onPanResponderTerminate();
    input.onPanResponderEnd(event('second', 400, true));
  });
  await click('Save picture');
  expect(sdk.save.mock.calls.at(-1)[0].strokes).toHaveLength(2);
  await click('Undo');
  await frames();
  await click('Save picture');
  expect(sdk.save.mock.calls.at(-1)[0].strokes).toHaveLength(1);
  await click('Undo');
  await frames();
  await click('Save picture');
  expect(sdk.save.mock.calls.at(-1)[0].strokes).toEqual([]);
});

it('releases the actual surface lock on suspension without letting an old save unlock its successor', async () => {
  let finishOld, finishNew;
  sdk.save
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      })
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishNew = resolve;
      })
    );
  await act(async () => root.render(createElement(DrawingScreen)));
  await frames();
  await click('Save picture');
  await act(async () => {
    for (const notify of sdk.appState) notify('background');
  });
  await act(async () => {
    for (const notify of sdk.appState) notify('active');
  });
  await click('Save picture');
  expect(sdk.save).toHaveBeenCalledTimes(2);
  await act(async () => finishOld());
  expect(button('Save picture').disabled).toBe(true);
  await act(async () => finishNew());
  expect(button('Save picture').disabled).toBe(false);
});
