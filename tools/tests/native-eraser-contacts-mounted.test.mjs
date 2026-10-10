// @vitest-environment happy-dom
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { createPaperScroll } from '../../experiments/native-architecture/src/drawing/paperGeometry.ts';
import { measurePaper as measureWebPaper } from '../../experiments/native-architecture/src/drawing/measurePaper.web.ts';

const sdk = vi.hoisted(() => ({
  handlers: null,
  frames: new Map(),
  nextFrame: 0,
  measurements: [],
  autoMeasure: true,
  frame: [0, 0, 1024, 768, 40, 800],
  captures: [],
  hold: false,
  fail: false,
  opened: null,
  save: vi.fn(),
  export: vi.fn(),
  soundStart: vi.fn(),
  soundStop: vi.fn(),
  soundVolume: vi.fn(),
  soundDispose: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(async () => ({
    start: sdk.soundStart,
    stop: sdk.soundStop,
    setVolume: sdk.soundVolume,
    dispose: sdk.soundDispose,
  })),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":true}'),
    write: vi.fn(),
  },
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  findNodeHandle: (owner) => owner,
  View: forwardRef(({ children, style }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(complete) {
        sdk.measurements.push(complete);
        if (sdk.autoMeasure) complete(...sdk.frame);
      },
    }));
    return createElement('div', { style }, children);
  }),
  PanResponder: {
    create: (handlers) => {
      sdk.handlers = handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  Dimensions: {
    get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove() {} }),
  },
  Platform: { OS: 'android' },
}));
vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: forwardRef(({ children, width, viewBox }, ref) => {
      useImperativeHandle(ref, () => ({
        toDataURL(callback, options) {
          sdk.captures.push({ callback, options, width, viewBox });
          if (sdk.fail) throw new Error('SDK capture failure');
          if (!sdk.hold) callback('SDK image fixture; no pixel claim');
        },
      }));
      return createElement('div', { 'data-svg': width }, children);
    }),
    G: ({ children, mask }) => createElement('div', { 'data-mask-use': mask }, children),
    Mask: ({ children }) => createElement('div', { 'data-mask': true }, children),
    Defs: group,
    Pattern: group,
    LinearGradient: group,
    Filter: group,
    Path: () => null,
    Use: () => null,
    Circle: () => null,
    Rect: () => null,
    Stop: () => null,
    FeBlend: () => null,
    FeComposite: () => null,
    Image: ({ href, onLoad }) => {
      useEffect(() => onLoad?.(), [href]);
      return createElement('div', { 'data-image': href });
    },
  };
});
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: sdk.save,
  exportPng: sdk.export,
  listPictures: () => [],
  reopenPicture: async () => sdk.opened,
}));

const PAPER_TARGET = 101;
const marker = { brush: 'marker', color: 'Blue', points: [{ x: 40, y: 60 }] };
let owner, root, host;
function Consumer() {
  owner = useDrawingScreen();
  const sound = useDrawingSound();
  return createElement(DrawingSurface, {
    sound: sound.owner?.contacts ?? null,
    key: owner.recovery.generation,
    ref: owner.surface,
    drawing: owner.history.drawing,
    currentDrawing: owner.currentDrawing,
    color: owner.color,
    brush: owner.brush,
    disabled: owner.busy || owner.settingsOpen,
    ...owner.recovery.callbacks,
  });
}
function touch(identifier, x, y, timestamp = 100) {
  return {
    identifier,
    locationX: -900,
    locationY: -800,
    pageX: x + 40,
    pageY: y + 800,
    timestamp,
    target: PAPER_TARGET,
  };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const t of [...touches, ...changedTouches])
    touchBank[t.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === t.identifier),
      startTimeStamp: starts[t.identifier] ?? t.timestamp,
    };
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}
async function send(name, value, start = name === 'onPanResponderGrant') {
  await act(async () => {
    sdk.handlers[name](value);
    if (start) sdk.handlers.onPanResponderStart(value);
  });
}
async function settle() {
  for (let count = 0; count < 8; count += 1)
    await act(async () => {
      const frames = [...sdk.frames.values()];
      sdk.frames.clear();
      for (const frame of frames) frame(0);
    });
}
async function open(drawing) {
  sdk.opened = drawing;
  await act(async () => owner.openPicture({ id: 'fixture', name: 'Fixture', modifiedAt: 1 }));
  await settle();
}
async function twoContacts() {
  await send('onPanResponderGrant', event([touch(0, 10, 20)]));
  await send(
    'onPanResponderStart',
    event([touch(0, 30, 40, 200), touch(1, 80, 90, 200)], [touch(1, 80, 90, 200)], { 0: 100 }),
    false
  );
  await send(
    'onPanResponderEnd',
    event([touch(0, 50, 60, 300)], [touch(1, 100, 110, 300)], { 0: 100, 1: 200 }),
    false
  );
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  sdk.frames.clear();
  sdk.captures.length = 0;
  sdk.measurements.length = 0;
  sdk.autoMeasure = true;
  sdk.hold = false;
  sdk.fail = false;
  sdk.frame = [0, 0, 1024, 768, 40, 800];
  sdk.save.mockClear();
  sdk.export.mockClear();
  sdk.soundStart.mockClear();
  sdk.soundStop.mockClear();
  sdk.soundVolume.mockClear();
  sdk.soundDispose.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++sdk.nextFrame;
    sdk.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => sdk.frames.delete(id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Consumer)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mounted joint cohort, canonical history and capture ownership', () => {
  it.each(['marker', 'eraser', 'crayon', 'magic'])(
    'finishes two %s contacts in one Undo group using measured page coordinates',
    async (brush) => {
      const base = { ...emptyDrawing(3, 'flower'), strokes: [marker] };
      await open(base);
      await act(async () => owner.setBrush(brush));
      await settle();
      const before = owner.history;
      await twoContacts();
      expect(owner.history).toBe(before);
      expect(owner.drawing).toBe(true);
      await send(
        'onPanResponderGrant',
        event([touch(0, 70, 80, 400)], undefined, { 0: 100 }),
        false
      );
      await send('onPanResponderEnd', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
      expect(owner.history.undo).toEqual([...before.undo, base]);
      const added = owner.history.drawing.strokes.slice(1);
      expect(added.map(({ brush: selected }) => selected)).toEqual([brush, brush]);
      expect(added.map(({ points }) => points)).toEqual([
        [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 },
          { x: 70, y: 80 },
          { x: 90, y: 100 },
        ],
        [
          { x: 80, y: 90 },
          { x: 100, y: 110 },
        ],
      ]);
      const expectedStyles = {
        marker: [
          { brush: 'marker', color: 'Purple' },
          { brush: 'marker', color: 'Purple' },
        ],
        crayon: [
          { brush: 'crayon', color: 'Purple', seed: 1 },
          { brush: 'crayon', color: 'Purple', seed: 2 },
        ],
        magic: [
          { brush: 'magic', rainbow: 3 },
          { brush: 'magic', rainbow: 3 },
        ],
        eraser: [{ brush: 'eraser' }, { brush: 'eraser' }],
      };
      expect(added.map(({ points: _points, ...style }) => style)).toEqual(expectedStyles[brush]);
      expect(host.querySelectorAll('[data-mask="true"]')).toHaveLength(brush === 'eraser' ? 1 : 0);
      await settle();
      await act(async () => owner.undo());
      expect(owner.history.drawing).toBe(base);
      expect(owner.history.drawing).toMatchObject({ version: 3, pageId: 'flower', rainbow: 3 });
    }
  );

  it('refuses a command during either active contact, including after a partial lift', async () => {
    await twoContacts();
    expect(() => owner.surface.current.lockInput()).toThrow('Finish drawing');
    await expect(owner.surface.current.captureInk(owner.history.drawing)).rejects.toThrow(
      'Lift your finger'
    );
    const before = owner.history;
    await act(async () => owner.save());
    expect(sdk.save).not.toHaveBeenCalled();
    expect(owner.history).toBe(before);
    await send('onPanResponderEnd', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
    await act(async () => owner.save());
    expect(sdk.save).toHaveBeenCalledExactlyOnceWith(owner.history.drawing);
  });

  it('blocks admission under a synchronous command lease and while actual output is pending', async () => {
    const drawing = owner.history.drawing;
    const handle = owner.surface.current;
    const release = handle.lockInput();
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(false);
    sdk.hold = true;
    let pending;
    await act(async () => {
      pending = handle.captureInk(drawing);
    });
    const failure = pending.catch((error) => error.message);
    await settle();
    await send('onPanResponderGrant', event([touch(0, 10, 20)]));
    await send('onPanResponderEnd', event([], [touch(0, 30, 40, 200)], { 0: 100 }), false);
    expect(owner.history.drawing).toBe(drawing);
    release();
    await act(async () => sdk.captures.at(-1).callback('late after release'));
    expect(await failure).toContain('changed');
    expect(owner.surface.current).toBe(handle);
    await send('onPanResponderGrant', event([touch(1, 50, 60, 300)]));
    await send('onPanResponderEnd', event([], [touch(1, 70, 80, 400)], { 1: 300 }), false);
    expect(owner.history.drawing.strokes).toHaveLength(1);
  });

  it('settles a cohort once on geometry invalidation and ignores stale or repeated measurements', async () => {
    await twoContacts();
    sdk.autoMeasure = false;
    await act(async () => owner.surface.current.refreshGeometry());
    const stale = sdk.measurements.at(-1);
    expect(owner.history.drawing.strokes).toHaveLength(2);
    const completed = owner.history;
    await act(async () => owner.surface.current.refreshGeometry());
    const latest = sdk.measurements.at(-1);
    await act(async () => {
      latest(0, 0, 1024, 768, 40, 700);
      stale(0, 0, 1024, 768, 0, 0);
      latest(0, 0, 1024, 768, 0, 0);
    });
    await send('onPanResponderMove', event([touch(0, 90, 100, 400)], undefined, { 0: 100 }), false);
    await send('onPanResponderEnd', event([], [touch(0, 110, 120, 500)], { 0: 100 }), false);
    expect(owner.history).toBe(completed);
    await send('onPanResponderGrant', event([touch(1, 60, 80, 600)]));
    await send('onPanResponderEnd', event([], [touch(1, 80, 100, 700)], { 1: 600 }), false);
    expect(owner.history.drawing.strokes.at(-1).points).toEqual([
      { x: 60, y: 180 },
      { x: 80, y: 200 },
    ]);
  });

  it('refuses old cohort/generation callbacks after actual Retry remount and ignores a late measurement', async () => {
    const before = owner.history;
    const old = owner.recovery.callbacks;
    sdk.autoMeasure = false;
    await act(async () => owner.surface.current.refreshGeometry());
    const measurement = sdk.measurements.at(-1);
    await act(async () => old.onRendererFault(new Error('SDK renderer fault')));
    sdk.autoMeasure = true;
    await act(async () => owner.recovery.retry());
    await settle();
    await act(async () => {
      measurement(0, 0, 1024, 768, 0, 0);
      old.onCohort([marker]);
      old.onDrawingChange(true);
      old.onRendererFault(new Error('late old renderer'));
    });
    expect(owner.history).toBe(before);
    expect(owner.recovery.failed).toBe(false);
    expect(owner.drawing).toBe(false);
    await send('onPanResponderGrant', event([touch(0, 10, 20)]));
    await send('onPanResponderEnd', event([], [touch(0, 30, 40, 200)], { 0: 100 }), false);
    expect(owner.history.drawing.strokes).toHaveLength(1);
  });

  it('retains one sound loop through a partial lift and ends it with the actual last contact', async () => {
    await twoContacts();
    expect(sdk.soundStart).toHaveBeenCalledOnce();
    expect(sdk.soundStop).not.toHaveBeenCalled();
    await send('onPanResponderEnd', event([], [touch(0, 90, 100, 500)], { 0: 100 }), false);
    expect(sdk.soundStop).toHaveBeenCalledOnce();
    expect(owner.history.drawing.strokes).toHaveLength(2);
    await settle();
    await act(async () => owner.undo());
    expect(owner.history.drawing.strokes).toEqual([]);
  });

  it('holds the real input lease throughout Settings and rejects commands until close', async () => {
    const before = owner.history;
    const staleChoosePage = owner.choosePage;
    await act(async () => owner.openSettings());
    expect(owner.settingsOpen).toBe(true);
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(false);
    await act(async () => {
      await owner.save();
      await owner.exportPicture();
      await owner.clear();
      owner.choosePage('flower');
      staleChoosePage('turtle');
    });
    expect(sdk.save).not.toHaveBeenCalled();
    expect(sdk.export).not.toHaveBeenCalled();
    expect(sdk.captures).toEqual([]);
    expect(owner.history).toBe(before);
    await act(async () => owner.closeSettings());
    expect(owner.settingsOpen).toBe(false);
    expect(sdk.handlers.onStartShouldSetPanResponder()).toBe(true);
  });

  it('refuses Settings during an admitted cohort and silences on measured geometry invalidation', async () => {
    await twoContacts();
    await act(async () => owner.openSettings());
    expect(owner.settingsOpen).toBe(false);
    await act(async () => owner.surface.current.refreshGeometry());
    expect(sdk.soundStop).toHaveBeenCalledOnce();
    const completed = owner.history;
    const samples = sdk.soundVolume.mock.calls.length;
    await send('onPanResponderMove', event([touch(0, 90, 100, 400)], undefined, { 0: 100 }), false);
    expect(sdk.soundVolume).toHaveBeenCalledTimes(samples);
    expect(owner.history).toBe(completed);
  });

  it('refreshes only on changed scroll offsets and translates web document coordinates', () => {
    const refresh = vi.fn();
    const scroll = createPaperScroll(refresh);
    scroll({ x: 0, y: 0 });
    scroll({ x: 0, y: 100 });
    scroll({ x: 0, y: 100 });
    expect(refresh).toHaveBeenCalledTimes(1);
    const measured = vi.fn();
    measureWebPaper(
      {
        getBoundingClientRect: () => ({ left: 20, top: 30, width: 1024, height: 768 }),
        ownerDocument: { defaultView: { scrollX: 40, scrollY: 500 } },
      },
      measured
    );
    expect(measured).toHaveBeenCalledExactlyOnceWith({
      width: 1024,
      height: 768,
      pageX: 60,
      pageY: 530,
    });
  });
});
