// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyDrawing } from './native-paper-fixtures.mjs';
import {
  COHORT_SETTLE_MS,
  PERF_LOG_MODULE,
  PERF_LOG_TAG,
} from '../../experiments/native-architecture/src/drawing/perfCohort.ts';

// Paths, not new URL(..., import.meta.url): happy-dom runs this file through Vite's browser
// transforms, which rewrite that form as an asset URL.
const ROOT = join(fileURLToPath(import.meta.url), '../../..');
const APP = 'experiments/native-architecture/';
const drawingModule = (file) => import(pathToFileURL(join(ROOT, `${APP}src/drawing/${file}`)).href);
const PLANE = { width: 400, height: 300 };
const VIEWPORT = { width: 1024, height: 768, bottomInset: 0 };
const BUILD = 'abc1234';

// Handing a picture to the view takes this long on the mocked clock, so a stamp taken before the
// hand-off reads short by exactly this much.
const HANDOFF_MS = 5;
const host = vi.hoisted(() => ({ modules: {}, touched: [], now: 0, frames: [] }));

vi.mock('react-native', async () => {
  const { nativeInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  const sdk = await nativeInkViewSdk(
    () => ({ width: 400, height: 300 }),
    (onLoad) => onLoad?.()
  );
  return {
    ...sdk,
    Platform: { OS: 'android' },
    NativeModules: new Proxy(
      {},
      {
        get: (_target, name) => {
          host.touched.push(name);
          return host.modules[name];
        },
      }
    ),
  };
});

vi.mock('@shopify/react-native-skia', async () => {
  const { recordingSkiaModule } = await import('./native-skia-recording-fixture.mjs');
  return recordingSkiaModule({});
});
vi.mock('../../experiments/native-architecture/src/drawing/skiaUndoGhostImage.ts', () => ({
  makeSkiaUndoGhost: () => null,
}));
vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk((onLoad) => onLoad?.());
});

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const ANDROID = `${APP}android/app/src/main/java/art/splotch/migration/probe/`;

// The input path and the ink import ./perfProbe, which resolves to the no-op contract outside
// Metro's native bundles; each test hands them a freshly evaluated native probe instead.
async function loadProbe(flag) {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_SPLOTCH_PERF_PROBE', flag);
  vi.stubEnv('EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD', BUILD);
  const probe = await drawingModule('perfProbe.native.ts');
  vi.doMock('../../experiments/native-architecture/src/drawing/perfProbe.ts', () => probe);
  return probe;
}

function writes() {
  return host.modules[PERF_LOG_MODULE]?.write.mock.calls.map(([line]) => JSON.parse(line)) ?? [];
}

// Each contact is [identifier, [[pageX, pageY, timestamp], ...]]; a contact starts at its first
// sample's time.
function createInput() {
  const starts = new Map();
  let sequence = 0;
  return function packet(phase, changed, contacts) {
    return {
      sequence: sequence++,
      phase,
      changed,
      viewport: VIEWPORT,
      contacts: contacts.map(([identifier, samples]) => {
        if (!starts.has(identifier)) starts.set(identifier, samples[0][2]);
        return {
          identifier,
          startedAt: starts.get(identifier),
          tool: 'touch',
          samples: samples.map(([pageX, pageY, timestamp]) => ({ pageX, pageY, timestamp })),
        };
      }),
    };
  };
}

async function createResponder() {
  const { createContactResponder } = await drawingModule('contactResponder.ts');
  const { createLiveInkFeed } = await drawingModule('liveInk.ts');
  const drawing = legacyDrawing();
  const responder = createContactResponder(
    () => ({
      currentDrawing: () => drawing,
      color: 'Red',
      brush: 'pen',
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      disabled: false,
      onCohort: () => {},
      onDrawingChange: () => {},
      onError: (error) => {
        throw error;
      },
    }),
    () => ({ width: 1024, height: 768, pageX: 0, pageY: 0 }),
    () => {},
    () => 1,
    createLiveInkFeed()
  );
  return { responder, packet: createInput() };
}

// After each packet, `submit` hands the scene a new picture, as SkiaInk does when the drafts change.
async function drawOneStroke(submit = () => {}) {
  const { responder, packet } = await createResponder();
  host.now = 1000;
  responder.receiveInput(packet('start', ['a'], [['a', [[500, 400, 995]]]]));
  await submit();
  host.now = 1008;
  const move = [
    [510, 400, 1003],
    [510, 400, 1005],
    [520, 400, 1007],
  ];
  responder.receiveInput(packet('move', ['a'], [['a', move]]));
  await submit();
  host.now = 1030;
  responder.receiveInput(packet('end', ['a'], [['a', [[520, 400, 1010]]]]));
  await submit();
}

// A stand-in for the drawing surface and its ink, rendering a new picture each time it is told to.
async function createScene() {
  const probe = await drawingModule('perfProbe.native.ts');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Scene() {
    probe.useSurfaceCommitProbe();
    probe.useInkCommitProbe();
    return null;
  }
  return {
    async submit() {
      await act(async () => root.render(createElement(Scene)));
      probe.perfSubmitted();
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

// SkiaInk with a live cohort: `start` and `sample` take a contact's samples as packets would, and
// `frame` runs the display frame callback.
async function inkHarness() {
  const { SkiaInk } = await drawingModule('SkiaInk.tsx');
  const { InkPaperScope } = await drawingModule('InkPaper.tsx');
  const { InkAppearanceScope } = await drawingModule('InkAppearance.tsx');
  const { ReduceMotionPreferenceProvider } = await drawingModule('useReduceMotion.ts');
  const { createContactCohort } = await drawingModule('contactCohort.ts');
  const { createLiveInkFeed } = await drawingModule('liveInk.ts');
  const { adoptedDrawing } = await import('./native-paper-fixtures.mjs');
  const drawing = adoptedDrawing({ ...PLANE, pixelRatio: 1 });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const feed = createLiveInkFeed();
  const cohort = createContactCohort();
  feed.connect(cohort);
  const ink = createElement(SkiaInk, {
    strokes: [],
    live: feed,
    paperFrame: { ...PLANE, pageX: 0, pageY: 0 },
    brush: 'pen',
    color: 'Green',
    onBusy: () => {},
    onError: (error) => {
      throw error;
    },
  });
  await act(async () =>
    root.render(
      createElement(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: 'blank', theme: 'light' } },
          createElement(InkPaperScope.Provider, { value: drawing.paper }, ink)
        )
      )
    )
  );
  return {
    start(point) {
      cohort.start('a', 'Green', 'pen', point, drawing);
      feed.publish();
    },
    sample(point) {
      cohort.sample('a', point);
      feed.publish();
    },
    frame() {
      act(() => {
        for (const callback of host.frames.splice(0)) callback(0);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host.modules = { [PERF_LOG_MODULE]: { write: vi.fn() } };
  host.touched.length = 0;
  host.now = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(performance, 'now').mockImplementation(() => host.now);
  host.frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => host.frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  // The ink view's picture reaches its native view through Skia's JSI view API
  // (skiaViewPicture.ts), which here moves the mocked clock on by HANDOFF_MS.
  vi.stubGlobal('SkiaViewApi', {
    setJsiProperty: () => {
      host.now += HANDOFF_MS;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the SplotchPerfLog native module', () => {
  it('registers the name JavaScript writes to and logs under the probe tag on both platforms', () => {
    const swift = read(`${APP}ios/HelloWorld/SplotchPerfLog.swift`);
    const bridge = read(`${APP}ios/HelloWorld/SplotchPerfLog.m`);
    const project = read(`${APP}ios/HelloWorld.xcodeproj/project.pbxproj`);
    const kotlin = read(`${ANDROID}SplotchPerfLog.kt`);
    expect(swift).toContain(`@objc(${PERF_LOG_MODULE})`);
    expect(swift).toContain(`category: "${PERF_LOG_TAG}"`);
    expect(swift).toContain('privacy: .public');
    expect(bridge).toContain(`RCT_EXTERN_MODULE(${PERF_LOG_MODULE}, NSObject)`);
    expect(bridge).toContain('RCT_EXTERN_METHOD(write:(NSString *)line)');
    for (const file of [`${PERF_LOG_MODULE}.swift`, `${PERF_LOG_MODULE}.m`])
      expect(project.match(new RegExp(`${file} in Sources \\*/,`, 'g'))).toHaveLength(1);
    expect(kotlin).toContain(`override fun getName() = "${PERF_LOG_MODULE}"`);
    expect(kotlin).toContain(`private const val PERF_LOG_TAG = "${PERF_LOG_TAG}"`);
    expect(kotlin).toContain('Log.i(PERF_LOG_TAG, line)');
    expect(read(`${ANDROID}MainApplication.kt`)).toContain('add(SplotchPerfLogPackage())');
  });

  // The mounted ink test below covers SkiaInk's probe; DrawingSurface needs the drawing screen.
  it('counts every DrawingSurface commit', () => {
    const surface = read(`${APP}src/drawing/DrawingSurface.tsx`);
    expect(surface.match(/^ {4}useSurfaceCommitProbe\(\);$/gm)).toHaveLength(1);
  });

  it('implements every export of the no-op contract the web export and Node resolve', async () => {
    const native = await loadProbe('1');
    const contract = await vi.importActual(
      '../../experiments/native-architecture/src/drawing/perfProbe.ts'
    );
    expect(Object.keys(native).sort()).toEqual(Object.keys(contract).sort());
    expect(contract.PERF_PROBE).toBe(false);
    const record = () => 1;
    expect(contract.perfTimed('liveFlush', record)).toBe(record);
  });
});

describe('without EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1', () => {
  // Negative control: enabling the probe for any defined flag value fails the '0' and 'true' runs.
  it.each([undefined, '0', 'true'])('stays inert with the flag %s', async (flag) => {
    const probe = await loadProbe(flag);
    expect(probe.PERF_PROBE).toBe(false);
    const record = () => 1;
    expect(probe.perfTimed('sceneRecord', record)).toBe(record);
    expect(probe.useInkCommitProbe).toBe(probe.useSurfaceCommitProbe);
    await drawOneStroke();
    const ink = await inkHarness();
    ink.start({ x: 1, y: 1 });
    ink.frame();
    ink.unmount();
    vi.advanceTimersByTime(COHORT_SETTLE_MS);
    expect(host.touched).not.toContain(PERF_LOG_MODULE);
    expect(writes()).toEqual([]);
  });
});

describe('with EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1', () => {
  // Negative control: dropping any one probe call from the input path zeroes its count here.
  it('counts what the input path did with one stroke and writes one line once it settles', async () => {
    await loadProbe('1');
    const scene = await createScene();
    await drawOneStroke(scene.submit);
    scene.unmount();
    vi.advanceTimersByTime(COHORT_SETTLE_MS - 1);
    expect(writes()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(writes()).toEqual([
      expect.objectContaining({
        probe: PERF_LOG_TAG,
        v: 2,
        build: BUILD,
        platform: 'android',
        cohort: 1,
        cohortMs: 30,
        strokes: 1,
        points: 3,
        packets: 3,
        samples: 5,
        maxSamplesPerPacket: 3,
        appended: 2,
        duplicate: 2,
        inkLayoutEffectCommits: 3,
        surfaceLayoutEffectCommits: 3,
        inputToSubmission: { n: 2, p50Ms: 1, p95Ms: 5, maxMs: 5, minMs: 1 },
        oldestToSubmission: { n: 2, p50Ms: 5, p95Ms: 5, maxMs: 5, minMs: 5 },
        firstDotMs: 5,
        handoffs: 2,
        submissionGap: { n: 1, p50Ms: 8, p95Ms: 8, maxMs: 8, minMs: 8 },
        clockJoin: { clock: 'CLOCK_MONOTONIC', errorMs: 1 },
      }),
    ]);
  });

  it('holds two overlapping contacts in one cohort', async () => {
    await loadProbe('1');
    const { responder, packet } = await createResponder();
    const a = (samples) => ['a', samples];
    const b = (samples) => ['b', samples];
    responder.receiveInput(packet('start', ['a'], [a([[500, 400, 200]])]));
    responder.receiveInput(packet('start', ['b'], [a([[500, 400, 200]]), b([[600, 400, 204]])]));
    responder.receiveInput(
      packet('move', ['a', 'b'], [a([[510, 400, 208]]), b([[610, 400, 208]])])
    );
    responder.receiveInput(packet('end', ['a'], [a([[510, 400, 212]]), b([[610, 400, 208]])]));
    vi.advanceTimersByTime(COHORT_SETTLE_MS);
    expect(writes()).toEqual([]);
    responder.receiveInput(packet('end', ['b'], [b([[620, 400, 216]])]));
    responder.receiveInput(packet('start', ['c'], [['c', [[500, 300, 300]]]]));
    responder.receiveInput(packet('end', ['c'], [['c', [[500, 300, 304]]]]));
    vi.advanceTimersByTime(COHORT_SETTLE_MS);
    expect(
      writes().map(({ cohort, packets, samples, appended, duplicate, strokes, points }) => ({
        cohort,
        packets,
        samples,
        appended,
        duplicate,
        strokes,
        points,
      }))
    ).toEqual([
      { cohort: 1, packets: 5, samples: 6, appended: 3, duplicate: 1, strokes: 2, points: 3 },
      { cohort: 2, packets: 2, samples: 2, appended: 0, duplicate: 1, strokes: 1, points: 1 },
    ]);
  });

  // Live ink renders no SkiaInk commit. The first packet of a display frame flushes, records a
  // scene and hands it over at once; a later packet in that frame waits for the frame callback.
  // Negative controls: stamping before Skia's JSI setter puts the stamp before the hand-off;
  // waiting for the frame callback to paint the first packet measures it as 27.5 ms, not 15.
  it('hands the first packet of a frame over at once and the rest at the frame callback', async () => {
    const probe = await loadProbe('1');
    const ink = await inkHarness();
    const packet = createInput();
    host.now = 2000;
    probe.perfPacket(packet('start', ['a'], [['a', [[500, 400, 1990]]]]));
    probe.perfStroke(1990);
    ink.start({ x: 10, y: 10 });
    host.now = 2008;
    probe.perfPacket(
      packet(
        'move',
        ['a'],
        [
          [
            'a',
            [
              [510, 400, 2003],
              [520, 400, 2006],
            ],
          ],
        ]
      )
    );
    for (const [x, timestamp] of [
      [20, 2003],
      [30, 2006],
    ]) {
      probe.perfSampleTime(timestamp);
      probe.perfAppend('appended');
      ink.sample({ x, y: 10 });
    }
    host.now = 2012.5;
    ink.frame();
    probe.perfIdle();
    ink.unmount();
    vi.advanceTimersByTime(COHORT_SETTLE_MS);
    expect(writes()).toEqual([
      expect.objectContaining({
        inkLayoutEffectCommits: 0,
        liveFlush: { n: 2, totalMs: 0, maxMs: 0 },
        sceneRecord: { n: 2, totalMs: 0, maxMs: 0 },
        inputToSubmission: { n: 2, p50Ms: 11.5, p95Ms: 15, maxMs: 15, minMs: 11.5 },
        oldestToSubmission: { n: 2, p50Ms: 14.5, p95Ms: 15, maxMs: 15, minMs: 14.5 },
        firstDotMs: 15,
        handoffs: 2,
        submissionGap: { n: 1, p50Ms: 12.5, p95Ms: 12.5, maxMs: 12.5, minMs: 12.5 },
      }),
    ]);
  });
});
