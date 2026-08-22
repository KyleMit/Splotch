import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  LATE_FRAME_MULTIPLE,
  comparisonRows,
  NOTABLE_LIFT_MS,
  QUEUE_DELAY_LAG_MS,
  REAL_SCREEN_SCHEMA_VERSION,
  STARVATION_FRAME_MULTIPLE,
  STALL_FRAME_MS,
  classifyPhase,
  frameStats,
  longStrokeTrend,
  observedFrameIntervalMs,
  percentile,
  segmentStrokes,
  starvationEpisodes,
  summarizeRun,
} from '../lib/real-screen-stats.mjs';
import { probeConfigScript, validateFreeDrawOptions } from '../ios/capture-webkit-frames.mjs';
import {
  appiumCapabilities,
  blockServiceWorkerRegistrationForMeasurement,
  borrowedSessionDescriptor,
  cacheEvictionAcceptable,
  capturedDeviceId,
  dismissInstallBannerForMeasurement,
  inputFidelity,
  isWebContext,
  nativeCanvasBounds,
  nativeOrientationNeedsUnlock,
  summarizeLiveSurfaceTopology,
  trustedGestureActions,
} from '../ios/capture-xcuitest-screen.mjs';
import {
  ACTION_FIRST_FRAME_GATE_MS,
  ACTION_FRAME_MAX_GATE_MS,
  ACTION_FRAME_P95_GATE_MS,
  MIN_GATED_SAMPLES,
  WARMUP_REPEATS,
  actionFailures,
  actionRows,
  summarizeActionGroup,
  summarizeActions,
} from '../lib/action-stats.mjs';
import {
  PAINT_MAX_GATE_MS,
  PAINT_P95_GATE_MS,
  PAINT_P99_GATE_MS,
  LOST_FRAME_TIME_SHARE_GATE,
  drawingGateRows,
  scoreDrawingPhase,
  scoreDrawingRun,
} from '../lib/drawing-gates.mjs';
import { summarizeUndoActions } from '../lib/undo-action-stats.mjs';

const PROBE = readFileSync(join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js'), 'utf8');
const ACTION_RUNNER = readFileSync(
  join(ROOT, 'tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs'),
  'utf8'
);
const STORAGE_KEYS_SOURCE = readFileSync(join(ROOT, 'web', 'src', 'lib', 'storageKeys.ts'), 'utf8');
const SCREENSHOT_MODULE = readFileSync(
  join(ROOT, 'web', 'src', 'lib', 'drawing', 'screenshot.ts'),
  'utf8'
);
const component = (name) =>
  readFileSync(join(ROOT, 'web', 'src', 'lib', 'components', name), 'utf8');

const DOWN = 0;
const MOVE = 1;
const UP = 2;

const move = (
  stamp,
  {
    at = stamp + 6,
    id = 1,
    buttons = 1,
    coalesced = 0,
    onCanvas = 1,
    kind = 0,
    trusted = 1,
    pressure = 0.5,
    width = 30,
    height = 30,
    coalescedFirst = -1,
    coalescedLast = -1,
  } = {}
) => [
  stamp,
  at,
  MOVE,
  id,
  buttons,
  coalesced,
  onCanvas,
  kind,
  trusted,
  pressure,
  width,
  height,
  coalescedFirst,
  coalescedLast,
];
const down = (stamp, id = 1) => [stamp, stamp + 6, DOWN, id, 1, 0, 1, 0, 1, 0.5, 30, 30, -1, -1];
const up = (stamp, id = 1) => [stamp, stamp + 6, UP, id, 0, 0, 1, 0, 1, 0, 30, 30, -1, -1];

describe('borrowedSessionDescriptor', () => {
  it('fails closed without resolved target provenance', () => {
    expect(() => borrowedSessionDescriptor('borrowed-session', null)).toThrow(
      '--session-id requires --capabilities-file so borrowed-session artifacts retain target provenance'
    );
  });

  it('uses resolved capabilities without querying the non-W3C session endpoint', () => {
    const capabilities = {
      platformName: 'Android',
      browserName: 'Chrome',
      'appium:udid': 'physical-device',
      'appium:deviceName': 'Samsung SM-G990U1',
      'appium:platformVersion': '16',
    };

    expect(borrowedSessionDescriptor('borrowed-session', capabilities)).toEqual({
      sessionId: 'borrowed-session',
      capabilities: {
        ...capabilities,
        deviceName: 'Samsung SM-G990U1',
        platformVersion: '16',
      },
    });
  });
});

describe('cacheEvictionAcceptable', () => {
  it('accepts an eviction that completed', () => {
    expect(
      cacheEvictionAcceptable({ ok: true, registrations: 2, controlled: true, cachesCleared: true })
    ).toBe(true);
  });

  it('accepts a page with no worker, where CacheStorage was deliberately not touched', () => {
    expect(
      cacheEvictionAcceptable({
        ok: true,
        registrations: 0,
        controlled: false,
        cachesSkipped: true,
      })
    ).toBe(true);
  });

  it('fails closed when neither an eviction nor a skip is reported', () => {
    expect(cacheEvictionAcceptable({ ok: true, registrations: 0, controlled: true })).toBe(false);
    expect(cacheEvictionAcceptable({ ok: true, registrations: 1, controlled: false })).toBe(false);
  });

  it('fails closed when the page could not report at all', () => {
    expect(cacheEvictionAcceptable({ ok: false, message: 'boom' })).toBe(false);
    expect(cacheEvictionAcceptable(undefined)).toBe(false);
  });
});

describe('capturedDeviceId', () => {
  it('prefers the explicitly requested device', () => {
    expect(capturedDeviceId('00008103-0006202E3CF1001E', { capabilities: { udid: 'other' } })).toBe(
      '00008103-0006202E3CF1001E'
    );
  });

  it('reads the negotiated session when a capability file supplied the target', () => {
    expect(capturedDeviceId(undefined, { capabilities: { udid: 'R5CRC3AVCXM' } })).toBe(
      'R5CRC3AVCXM'
    );
  });

  it('accepts the prefixed capability and the unwrapped session envelope', () => {
    expect(
      capturedDeviceId(undefined, {
        value: { capabilities: { 'appium:udid': '00008103-0006202E3CF1001E' } },
      })
    ).toBe('00008103-0006202E3CF1001E');
  });

  it('falls back to cloud only when no session names a device', () => {
    expect(capturedDeviceId(undefined, { capabilities: { platformName: 'iOS' } })).toBe('cloud');
  });
});

// A 60 Hz capture, since that is what Safari actually gives web content on the
// ProMotion iPad this exists to measure.
const beat = (count, { from = 0, interval = 16.7, contact = 1 } = {}) =>
  Array.from({ length: count }, (_, i) => [from + i * interval, i === 0 ? -1 : interval, contact]);

describe('native screen orientation preparation', () => {
  it('unlocks only native captures that will rotate', () => {
    const baseline = {
      nativeApp: true,
      rotateBeforeUndo: false,
      requestedOrientation: 'PORTRAIT',
      originalOrientation: 'PORTRAIT',
    };

    expect(nativeOrientationNeedsUnlock(baseline)).toBe(false);
    expect(nativeOrientationNeedsUnlock({ ...baseline, requestedOrientation: 'LANDSCAPE' })).toBe(
      true
    );
    expect(nativeOrientationNeedsUnlock({ ...baseline, rotateBeforeUndo: true })).toBe(true);
    expect(
      nativeOrientationNeedsUnlock({
        ...baseline,
        nativeApp: false,
        requestedOrientation: 'LANDSCAPE',
      })
    ).toBe(false);
  });
});

describe('percentile', () => {
  it('is absent rather than zero for an empty sample', () => {
    expect(percentile([], 0.95)).toBeUndefined();
  });

  it('takes the nearest rank without interpolating', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });
});

describe('undo action response', () => {
  it('measures engine work and the first frame after each action', () => {
    const summary = summarizeUndoActions(
      [
        { startedAt: 10, engineMs: 4 },
        { startedAt: 40, engineMs: 7 },
      ],
      [
        [16, 16, 0],
        [33, 17, 0],
        [49, 16, 0],
      ]
    );

    expect(summary.engine).toMatchObject({ p50: 4, p95: 7, max: 7 });
    expect(summary.nextFrame).toMatchObject({ p50: 6, p95: 9, max: 9 });
    expect(summary.passed).toBe(true);
  });

  it('fails when undo misses the frame-derived response gates', () => {
    const summary = summarizeUndoActions([{ startedAt: 10, engineMs: 24 }], [[65, 55, 0]]);

    expect(summary.passed).toBe(false);
  });

  it('uses the action-local next frame when the global probe was suspended', () => {
    const summary = summarizeUndoActions(
      [{ startedAt: 100, engineMs: 1, nextFrameMs: 12 }],
      [[90, 16, 0]]
    );

    expect(summary.nextFrame).toMatchObject({ p95: 12, max: 12 });
    expect(summary.passed).toBe(true);
  });
});

describe('discrete action response', () => {
  const clean = (label, readyMs = 24) => ({
    label,
    eventType: 'click',
    trusted: true,
    readyMs,
    firstFrameMs: 8,
    frameGapsMs: [8, 9, 16, 9, 9, 8, 9, 10, 9, 8, 9, 8, 9, 10, 8, 9, 9, 8, 9, 16],
  });

  it('groups repeated actions and reports their response distributions', () => {
    const summaries = summarizeActions([
      clean('theme dark to light', 20),
      clean('theme dark to light', 28),
      clean('open brush menu', 12),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      label: 'theme dark to light',
      count: 2,
      ready: { p50: 20, p95: 28 },
      passed: true,
    });
    expect(actionRows(summaries)[0]).toMatchObject({
      action: 'theme dark to light',
      runs: '2/2',
      activation: '2/2',
      verdict: 'PASS',
    });
    expect(actionFailures(summaries)).toEqual([]);
  });

  it.each([
    ['first visible response', { firstFrameMs: ACTION_FIRST_FRAME_GATE_MS + 1 }],
    [
      'sustained pacing',
      {
        frameGapsMs: Array.from({ length: 20 }, (_, index) =>
          index < 2 ? ACTION_FRAME_P95_GATE_MS + 1 : 9
        ),
      },
    ],
    ['single freeze', { frameGapsMs: [9, 9, ACTION_FRAME_MAX_GATE_MS + 1] }],
  ])('fails a %s regression', (_name, change) => {
    expect(summarizeActionGroup([{ ...clean('action'), ...change }]).passed).toBe(false);
  });

  it('keeps readiness latency informational because completion semantics differ by action', () => {
    expect(summarizeActionGroup([clean('full-resolution image decode', 4_000)]).passed).toBe(true);
  });

  it('allows one isolated pair of 60 Hz vsync intervals', () => {
    const frameGapsMs = Array.from({ length: 40 }, () => 1000 / 60);
    frameGapsMs[20] = 2000 / 60;

    expect(
      summarizeActionGroup([{ ...clean('rotation'), firstFrameMs: 2000 / 60, frameGapsMs }]).passed
    ).toBe(true);
  });

  it('scores the event-straddling frame by its post-action remainder', () => {
    const summary = summarizeActionGroup([
      {
        ...clean('rotation'),
        firstFrameMs: 29,
        frameGapsMs: [52, 17, 17],
        postActionFrameGapsMs: [17, 17],
      },
    ]);

    expect(summary.passed).toBe(true);
  });

  it('fails an uncaptured or explicitly untrusted activation', () => {
    expect(summarizeActionGroup([{ ...clean('action'), eventType: 'uncaptured' }]).passed).toBe(
      false
    );
    expect(
      summarizeActionGroup([{ ...clean('action'), activation: 'native-touch', trusted: false }])
        .passed
    ).toBe(false);
    expect(
      summarizeActionGroup([
        { ...clean('action'), activation: 'webdriver-element-click', trusted: false },
      ]).passed
    ).toBe(true);
  });

  it('keeps one warmup in the artifact but requires three scored samples', () => {
    const warmup = { ...clean('action'), repeat: 1, warmup: true, firstFrameMs: 200 };
    const scored = Array.from({ length: MIN_GATED_SAMPLES }, (_, index) => ({
      ...clean('action'),
      repeat: index + WARMUP_REPEATS + 1,
      warmup: false,
    }));

    expect(summarizeActionGroup([warmup, ...scored])).toMatchObject({
      count: MIN_GATED_SAMPLES,
      totalCount: MIN_GATED_SAMPLES + WARMUP_REPEATS,
      passed: true,
    });
    expect(summarizeActionGroup([warmup, ...scored.slice(1)]).passed).toBe(false);
  });

  it('fails an expected action label that produced no samples', () => {
    expect(summarizeActions([], ['missing action'])).toEqual([
      expect.objectContaining({ label: 'missing action', count: 0, passed: false }),
    ]);
  });
});

describe('drawing acceptance gates', () => {
  const phase = (changes = {}) => ({
    key: 'blank',
    paintLatencyMs: {
      p95: PAINT_P95_GATE_MS,
      p99: PAINT_P99_GATE_MS,
      max: PAINT_MAX_GATE_MS,
    },
    starvation: {
      inContact: {
        lostFrameTimeShare: LOST_FRAME_TIME_SHARE_GATE,
      },
    },
    ...changes,
  });

  it('accepts the documented paint and starvation boundaries', () => {
    const score = scoreDrawingRun([phase()]);

    expect(score.passed).toBe(true);
    expect(drawingGateRows(score)[0]).toMatchObject({
      phase: 'blank',
      verdict: 'PASS',
    });
  });

  it.each([
    ['paint P95', { paintLatencyMs: { p95: 21, p99: 30, max: 40 } }],
    ['paint P99', { paintLatencyMs: { p95: 18, p99: 34, max: 40 } }],
    ['paint max', { paintLatencyMs: { p95: 18, p99: 30, max: 51 } }],
    [
      'render starvation',
      { starvation: { inContact: { lostFrameTimeShare: LOST_FRAME_TIME_SHARE_GATE + 0.0001 } } },
    ],
  ])('fails a %s regression', (_name, change) => {
    expect(scoreDrawingPhase(phase(change)).passed).toBe(false);
  });

  it('requires every captured phase to pass', () => {
    expect(
      scoreDrawingRun([
        phase(),
        phase({
          key: 'second',
          paintLatencyMs: { p95: 18, p99: 30, max: 51 },
        }),
      ]).passed
    ).toBe(false);
  });
});

describe('observedFrameIntervalMs', () => {
  // The bug this exists to prevent: a fixed 8.33 ms budget reported 64% of a
  // perfectly-paced 60 Hz device capture as late frames.
  it('reports the beat the capture actually got, not the display refresh rate', () => {
    expect(observedFrameIntervalMs(beat(200, { interval: 16.7 }))).toBeCloseTo(16.7, 1);
  });

  it('is unmoved by a minority of stalled frames', () => {
    const frames = [...beat(180), ...beat(20, { from: 5000, interval: 300 })];
    expect(observedFrameIntervalMs(frames)).toBeCloseTo(16.7, 1);
  });

  // The physical-iPad case: Safari holds 60 Hz for web content and emits an
  // occasional short frame, which drags a low percentile below the rate the
  // display actually held.
  it('is unmoved by a minority of short frames on an otherwise steady beat', () => {
    const frames = [...beat(190, { interval: 16.7 }), ...beat(10, { from: 9000, interval: 10 })];
    expect(observedFrameIntervalMs(frames)).toBeCloseTo(16.7, 1);
  });

  // The physical-Android case: Chrome raises the rate under touch and falls back
  // between strokes, so a capture is a mix of two refresh rates.
  it('reports the rate a variable-refresh capture held for most of its frames', () => {
    const frames = [...beat(140, { interval: 8.3 }), ...beat(60, { from: 5000, interval: 16.6 })];
    expect(observedFrameIntervalMs(frames)).toBeCloseTo(8.3, 1);
  });

  it('falls back to the tenth percentile when no interval dominates', () => {
    const frames = [
      ...beat(40, { interval: 10 }),
      ...beat(40, { from: 2000, interval: 20 }),
      ...beat(40, { from: 4000, interval: 30 }),
      ...beat(40, { from: 7000, interval: 40 }),
      ...beat(40, { from: 11000, interval: 50 }),
    ];
    expect(observedFrameIntervalMs(frames)).toBeCloseTo(10, 0);
  });
});

describe('frameStats', () => {
  it('counts a frame late only past the multiple of the observed beat', () => {
    // 24 ms is jitter around a 16.7 ms beat, not a missed one: the threshold is
    // 25.05 ms, so only the 30 and 40 count.
    const stats = frameStats([16.7, 16.7, 16.7, 24, 30, 40], 16.7);

    expect(stats.lateThresholdMs).toBeCloseTo(16.7 * LATE_FRAME_MULTIPLE, 1);
    expect(stats.frames).toBe(6);
    expect(stats.lateShare).toBeCloseTo(2 / 6, 2);
  });

  it('charges only the beat-over-budget portion to lost time', () => {
    // One 116.7 ms frame against a 16.7 ms beat costs 100 ms of waiting.
    expect(frameStats([16.7, 116.7], 16.7).lostMs).toBeCloseTo(100, 0);
  });

  it('credits a late frame that the next frame gives back', () => {
    // The ProMotion jitter pair: a 29 ms callback followed by a 4 ms one sums to
    // two 16.7 ms beats, so the display never skipped a slot. 12.3 ms over budget
    // less 12.7 ms repaid floors to zero.
    expect(frameStats([16.7, 29, 4, 16.7], 16.7).lostMs).toBe(0);
  });

  it('still charges a missed slot that is never repaid', () => {
    // Same 29 ms overshoot, but the next frame arrives on the beat rather than
    // early, so nothing was given back and the excess stands.
    expect(frameStats([16.7, 29, 16.7, 16.7], 16.7).lostMs).toBeCloseTo(12.3, 1);
  });

  it('credits only up to the charge, never below zero across a pair', () => {
    // A 26 ms frame followed by a 1 ms one: 9.3 ms charged against 15.7 ms
    // repaid must not turn into a negative charge that offsets real loss
    // elsewhere in the capture.
    expect(frameStats([26, 1, 116.7], 16.7).lostMs).toBeCloseTo(100, 0);
  });

  it('does not let an end-to-end regression raise its own frame budget', () => {
    const stats = frameStats(
      Array.from({ length: 400 }, () => 60),
      60
    );

    expect(stats.lostMs).toBeGreaterThan(17_000);
    expect(stats.lostFrameTimeShare).toBeGreaterThan(0.7);
  });

  it('reports a perfectly paced capture as entirely on time', () => {
    const stats = frameStats(
      Array.from({ length: 100 }, () => 16.7),
      16.7
    );

    expect(stats.lateShare).toBe(0);
    expect(stats.stallShare).toBe(0);
    expect(stats.lostMs).toBe(0);
  });
});

describe('starvationEpisodes', () => {
  const intervalMs = 16.7;
  const framesWithGap = (gapMs, { beforeContact = 1, afterContact = 1 } = {}) => {
    const frames = beat(20, { interval: intervalMs, contact: beforeContact });
    const start = frames.at(-1)[0];
    frames.push([start + gapMs, gapMs, afterContact]);
    return { frames, start, end: start + gapMs };
  };
  const trustedMoves = (start, end) => {
    const events = [];
    for (let stamp = start + 2; stamp + 6 < end; stamp += 8.3) events.push(move(stamp));
    return events;
  };

  it('detects the real 1422 ms low-engine-work signature', () => {
    const { frames, start, end } = framesWithGap(1422);
    const events = [down(start - 20), ...trustedMoves(start, end), up(end - 20)];
    const measures = [
      [start + 10, 5, 0],
      [start + 30, 2, 1],
    ];
    const [episode] = starvationEpisodes({
      frames,
      events,
      measures,
      measureNames: ['engine.draw', 'engine.commit'],
      intervalMs,
    });

    expect(episode.gapMs).toBe(1422);
    expect(episode.trustedMoves).toBeGreaterThan(100);
    expect(episode.engineMs).toBe(7);
    expect(episode.engineShare).toBeLessThan(0.1);
    expect(episode.population).toBe('inContact');
    expect(episode.nearestLift).toBeDefined();
    expect(episode.nearestCommit).toBeDefined();
  });

  it('does not classify a clean drawing frame', () => {
    const gapMs = QUEUE_DELAY_LAG_MS * STARVATION_FRAME_MULTIPLE;
    const { frames, start, end } = framesWithGap(gapMs);

    expect(
      starvationEpisodes({
        frames,
        events: trustedMoves(start, end),
        measures: [],
        intervalMs,
      })
    ).toEqual([]);
  });

  it('retains a contact-held freeze even when no trusted moves arrive', () => {
    const { frames } = framesWithGap(1422);
    const [episode] = starvationEpisodes({ frames, events: [], measures: [], intervalMs });

    expect(episode.trustedMoves).toBe(0);
    expect(episode.starvationMs).toBeCloseTo(1422 - intervalMs, 1);
  });

  it('counts trusted pen input as contact without admitting mouse input', () => {
    const { frames, start } = framesWithGap(400);
    const penMove = move(start + 20, { kind: 1 });
    const mouseMove = move(start + 40, { kind: 2 });
    const [episode] = starvationEpisodes({
      frames,
      events: [penMove, mouseMove],
      measures: [],
      intervalMs,
    });

    expect(episode.trustedMoves).toBe(1);
    expect(episode.trustedPointerKinds).toEqual(['pen']);
  });

  it('retains and labels a starvation episode between strokes', () => {
    const { frames, start, end } = framesWithGap(400, { afterContact: 0 });
    const [episode] = starvationEpisodes({
      frames,
      events: [...trustedMoves(start, end), up(start + 80)],
      measures: [[start + 60, 2, 0]],
      measureNames: ['engine.commit'],
      intervalMs,
    });

    expect(episode.population).toBe('betweenStrokes');
    expect(episode.nearestLift).toBeDefined();
  });

  it('subtracts marked engine work without discarding the unexplained remainder', () => {
    const { frames, start, end } = framesWithGap(400);
    const [episode] = starvationEpisodes({
      frames,
      events: trustedMoves(start, end),
      measures: [[start, 200, 0]],
      measureNames: ['engine.draw'],
      intervalMs,
    });

    expect(episode.engineShare).toBe(0.5);
    expect(episode.starvationMs).toBeCloseTo(400 - intervalMs - 200, 1);
  });
});

describe('segmentStrokes', () => {
  it('pairs each pointerdown with the up that ends it', () => {
    const strokes = segmentStrokes([down(100), move(120), move(140), up(160)]);

    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({ start: 100, end: 160, durationMs: 60, moves: 2 });
  });

  // WebKit merges a tap-then-draw into one stream and drops the pointerdown —
  // the case penStreamQuirks.ts adopts. Those strokes paint ink, so dropping
  // them would under-report exactly the sessions that hit the quirk.
  it('adopts a contact stream that never got a pointerdown', () => {
    const strokes = segmentStrokes([move(100), move(120), up(140)]);

    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({ start: 100, adopted: true, moves: 2 });
  });

  it('ignores events the canvas never received', () => {
    const offCanvas = [...move(100, { onCanvas: 0 })];
    expect(segmentStrokes([offCanvas, up(140)])).toHaveLength(0);
  });

  it('drops a stroke still open at the end of the recording rather than guessing', () => {
    expect(segmentStrokes([down(100), move(120)])).toHaveLength(0);
  });

  it('keeps concurrent pointers apart', () => {
    const strokes = segmentStrokes([
      down(100, 1),
      down(110, 2),
      move(120, { id: 1 }),
      up(130, 2),
      up(200, 1),
    ]);

    expect(strokes.map((stroke) => stroke.durationMs)).toEqual([20, 100]);
  });
});

describe('longStrokeTrend', () => {
  it('reports the ratio of a stroke that degrades as it goes', () => {
    // 30 frames: the first half at the beat, the last half at double.
    const frames = [
      ...beat(15, { from: 100, interval: 16.7 }),
      ...beat(15, { from: 400, interval: 33.4 }),
    ];
    const trend = longStrokeTrend([{ start: 100, end: 1000, durationMs: 900 }], frames);

    expect(trend.firstThirdP50).toBeCloseTo(16.7, 1);
    expect(trend.lastThirdP50).toBeCloseTo(33.4, 1);
    expect(trend.ratio).toBeCloseTo(2, 1);
  });

  it('has no opinion when a stroke has too few frames to split', () => {
    expect(longStrokeTrend([{ start: 0, end: 50 }], beat(3)).ratio).toBeUndefined();
  });
});

describe('classifyPhase', () => {
  const clean = {
    pacing: frameStats([16.7, 16.7, 16.7], 16.7),
    movesPerFrame: 1,
    queueDelays: [6, 6],
    latencies: [16, 16],
    intervalMs: 16.7,
  };

  it('says clean when pacing, input and latency are all at the beat', () => {
    expect(classifyPhase(clean)).toBe('clean');
  });

  it('separates input that never arrived from frames that came late', () => {
    expect(classifyPhase({ ...clean, movesPerFrame: 0.2 })).toContain('input loss');
    expect(classifyPhase({ ...clean, pacing: frameStats([16.7, 200, 200], 16.7) })).toContain(
      'frame loss'
    );
  });

  // The finding from the first device capture: input arriving on time at 120 Hz
  // against a 60 Hz presentable frame means per-event work runs more often than
  // it can possibly be shown.
  it('flags per-event work repeated within one presentable frame', () => {
    expect(classifyPhase({ ...clean, movesPerFrame: 2.3 })).toContain('redundant per-event work');
  });

  it('flags queued input separately from late frames', () => {
    expect(classifyPhase({ ...clean, queueDelays: [80, 90] })).toContain('input queued');
  });

  it('reports no drawing rather than a clean bill when nothing was recorded', () => {
    expect(classifyPhase({ ...clean, pacing: frameStats([], 16.7) })).toBe('no drawing recorded');
  });
});

describe('summarizePhase via summarizeRun', () => {
  const capture = () => {
    const frames = beat(120, { from: 1000, interval: 16.7 });
    const events = [down(1000), ...[...Array(50)].map((_, i) => move(1010 + i * 8.3)), up(1600)];
    return {
      meta: { measureNames: ['engine.draw'] },
      phases: [{ key: 'page', suppress: [], startedAt: 1000, endedAt: 3000, contactMs: 2000 }],
      frames,
      events,
      measures: [[1200, 0.4, 0]],
    };
  };

  it('summarizes a phase against the beat the capture observed', () => {
    const [phase] = summarizeRun(capture()).phases;

    expect(phase.key).toBe('page');
    expect(phase.pacing.p50).toBeCloseTo(16.7, 1);
    expect(phase.input.moves).toBe(50);
    expect(phase.strokes.count).toBe(1);
  });

  it('leads with cumulative lost time and partitions the whole window exactly', () => {
    const frames = [
      [1, -1, 1],
      [17.7, 16.7, 1],
      [77.7, 60, 1],
      [94.4, 16.7, 0],
      [154.4, 60, 0],
    ];
    const [phase] = summarizeRun({
      phases: [{ key: 'page', suppress: [], startedAt: 1, endedAt: 154.4, contactMs: 76.7 }],
      frames,
      events: [],
      measures: [],
    }).phases;

    expect(phase.starvation.all.episodes).toBe(0);
    expect(phase.starvation.inContact.lostFrameTimeMs).toBeGreaterThan(40);
    expect(phase.starvation.betweenStrokes.lostFrameTimeMs).toBeGreaterThan(40);
    expect(phase.starvation.all.lostFrameTimeMs).toBeCloseTo(
      phase.starvation.inContact.lostFrameTimeMs + phase.starvation.betweenStrokes.lostFrameTimeMs,
      1
    );
  });

  it('reports the trusted touch-input signature and contact geometry', () => {
    const [phase] = summarizeRun(capture()).phases;

    expect(phase.input.kinds).toBe('touch');
    expect(phase.input.trust).toEqual({ trusted: 50, untrusted: 0, unknown: 0, share: 1 });
    expect(phase.input.pressure.p50).toBe(0.5);
    expect(phase.input.contactWidth.p50).toBe(30);
    expect(phase.input.contactHeight.p50).toBe(30);
  });

  it('retains coalesced-event timestamp span', () => {
    const report = capture();
    report.events[1] = move(1010, {
      coalesced: 3,
      coalescedFirst: 1002,
      coalescedLast: 1010,
    });

    expect(summarizeRun(report).phases[0].input.coalescedSpanMs).toMatchObject({
      p50: 8,
      p95: 8,
      max: 8,
    });
  });

  // A phase's clock runs while the finger is down, so it always ends mid-stroke;
  // windowing events first dropped the last stroke of every phase, and with it
  // the end hitch — the rapid-repeated-strokes case.
  it('claims a stroke that outlives the phase boundary', () => {
    const report = capture();
    report.phases[0].endedAt = 1300;

    expect(summarizeRun(report).phases[0].strokes.count).toBe(1);
  });

  it('marks a phase that never met its paper requirement as skipped', () => {
    const report = capture();
    report.phases[0].startedAt = null;

    expect(summarizeRun(report).phases[0].skipped).toBe('never started');
  });

  it('surfaces the observed beat on the summary set', () => {
    expect(summarizeRun(capture()).intervalMs).toBeCloseTo(16.7, 1);
  });

  // The beat used to ride on the returned array as a property, and
  // JSON.stringify drops non-index properties of an array — so the one number
  // every lateThresholdMs hangs off vanished from every saved summaries file,
  // in an artifact whose whole purpose is outliving the maths that made it.
  it('survives the JSON round-trip a saved capture puts it through', () => {
    const roundTripped = JSON.parse(JSON.stringify(summarizeRun(capture())));

    expect(roundTripped.intervalMs).toBeCloseTo(16.7, 1);
    expect(roundTripped.phases).toHaveLength(1);
  });
});

// The blocking finding of PR #660's review. segmentStrokes emits strokes in LIFT
// order, so two contacts on the paper at once put the earlier-STARTING stroke
// second; a single forward-only cursor then matched its moves against frames from
// seconds later. Measured 3056 ms p95 against 0 for the same input on one pointer,
// and classifyPhase picked up a fabricated `paint latency` verdict from it.
describe('paint latency with overlapping contacts', () => {
  const interval = 16.7;
  // Pointer 1 spans the whole window; pointer 2 opens and closes inside it, so it
  // is pushed FIRST by segmentStrokes.
  const stream = (id, from, to) => {
    const out = [down(from, id)];
    for (let t = from + interval; t < to; t += interval) out.push(move(round1(t), { id }));
    out.push(up(round1(to), id));
    return out;
  };
  const round1 = (v) => Math.round(v * 10) / 10;
  const frames = beat(260, { from: 100, interval });
  const run = (events) =>
    summarizeRun({
      meta: { measureNames: [] },
      phases: [{ key: 'p', suppress: [], startedAt: 100, endedAt: 4300, contactMs: 3900 }],
      frames,
      events: [...events].sort((a, b) => a[0] - b[0]),
      measures: [],
    }).phases[0];

  it('matches each move to its own next frame regardless of stroke order', () => {
    const overlapping = run([...stream(1, 100, 4000), ...stream(2, 3000, 3400)]);
    const single = run(stream(1, 100, 4000));

    // Both hands drew at the frame rate, so neither can wait longer than a beat.
    expect(overlapping.paintLatencyMs.p95).toBeLessThanOrEqual(interval);
    expect(overlapping.paintLatencyMs.max).toBeLessThanOrEqual(interval);
    expect(overlapping.paintLatencyMs.p95).toBeCloseTo(single.paintLatencyMs.p95, 0);
  });

  it('does not invent a paint-latency verdict from the interleaving', () => {
    expect(run([...stream(1, 100, 4000), ...stream(2, 3000, 3400)]).verdict).not.toContain(
      'paint latency'
    );
  });
});

describe('comparisonRows', () => {
  const phase = (key, latencies) => ({
    key,
    pacing: frameStats([16.7, 16.7], 16.7),
    paintLatencyMs: { p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99) },
  });

  it('reports a delta when both sides measured something', () => {
    const [row] = comparisonRows([phase('page', [10, 10]), phase('page-bare', [4, 4])], 'page');

    expect(row['Δ paint p95 vs page']).toBeCloseTo(-6, 1);
  });

  // percentile() returns undefined for an empty sample precisely so absence reads
  // as absent; a `?? 0` here turned a phase that banked no strokes into a clean
  // win under a table captioned "negative is better".
  it('leaves the delta absent when a phase measured nothing, rather than showing a win', () => {
    const [row] = comparisonRows([phase('page', [10, 10]), phase('page-bare', [])], 'page');

    expect(row['Δ paint p95 vs page']).toBeUndefined();
    expect(row['Δ paint p99']).toBeUndefined();
  });
});

describe('probeConfigScript', () => {
  // Same guarantee as perf:ios:webkit:gates's overrides script, for the same reason: a
  // leftover config silently changes what a run measured and the output looks
  // completely normal.
  it('assigns every global the probe reads, including the ones not requested', () => {
    const script = probeConfigScript({});

    for (const name of ['__probePhases', '__probeContactMs', '__probeDrive', '__probeHud']) {
      expect(script).toContain(`window.${name} = undefined;`);
    }
  });

  it('clears the globals a previous run published', () => {
    const script = probeConfigScript({ phases: 'blank' });

    expect(script).toContain('window.__probeReport = undefined;');
    expect(script).toContain('window.__probeProgress = undefined;');
  });

  it('passes the requested phases, contact budget and drive shape', () => {
    const script = probeConfigScript({
      phases: 'blank,page',
      contactMs: 20000,
      drive: 'mixed',
      brush: 'magic',
    });

    expect(script).toContain('window.__probePhases = "blank,page";');
    expect(script).toContain('window.__probeContactMs = 20000;');
    expect(script).toContain('window.__probeDrive = "mixed";');
    expect(script).toContain('window.__probeBrush = "magic";');
  });

  it('rejects an unknown brush before a runner starts its browser', () => {
    expect(() => probeConfigScript({ brush: 'marker' })).toThrow(
      '--brush must be one of pen, crayon, magic, eraser'
    );
  });

  it('requires a valid free-draw duration and the START-button HUD', () => {
    expect(() => validateFreeDrawOptions(undefined, { bare: true })).toThrow(
      '--free-draw requires a duration'
    );
    expect(() => validateFreeDrawOptions('abc')).toThrow('--free-draw must be a positive number');
    expect(() => validateFreeDrawOptions('60', { hud: false })).toThrow(
      '--free-draw needs the on-device HUD'
    );
    expect(validateFreeDrawOptions('60', { hud: true })).toBe(60);
  });
});

describe('trusted XCUITest input', () => {
  const webGeometry = {
    canvas: { x: 84, y: 0, width: 1282, height: 934 },
    viewport: { width: 1366, height: 934 },
  };
  const webViewBounds = { x: 0, y: 0, width: 1366, height: 1024 };
  const nativeWindow = { x: 0, y: 0, width: 1366, height: 1024 };

  it('pins PWA side effects before measurement', async () => {
    const scripts = [];
    const execute = async (script) => {
      scripts.push(script);
      return script.includes("return 'blocked'") ? 'blocked' : true;
    };

    await dismissInstallBannerForMeasurement(execute);
    await expect(blockServiceWorkerRegistrationForMeasurement(execute)).resolves.toBe('blocked');

    const installKey = /installDismissed:\s*'([^']+)'/.exec(STORAGE_KEYS_SOURCE)?.[1];
    expect(installKey).toBeDefined();
    expect(scripts[0]).toContain(JSON.stringify(installKey));
    expect(scripts[1]).toContain("Object.defineProperty(navigator.serviceWorker, 'register'");
  });

  it('maps CSS canvas coordinates below Safari chrome', () => {
    expect(nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow })).toEqual({
      x: 84,
      y: 90,
      width: 1282,
      height: 934,
    });
  });

  it('maps native WebView coordinates without adding browser chrome', () => {
    expect(
      nativeCanvasBounds({
        webGeometry,
        webViewBounds,
        nativeWindow,
        includeBrowserChrome: false,
      })
    ).toEqual({
      x: 84,
      y: 0,
      width: 1282,
      height: 934,
    });
  });

  it('recognizes iOS, Android WebView, and Android Chrome contexts', () => {
    expect(isWebContext('WEBVIEW_42')).toBe(true);
    expect(isWebContext('WEBVIEW_art.splotch.app')).toBe(true);
    expect(isWebContext('CHROMIUM')).toBe(true);
    expect(isWebContext('NATIVE_APP')).toBe(false);
  });

  it('builds two long and eight short native strokes inside the canvas', () => {
    const bounds = nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow });
    const actions = trustedGestureActions(bounds);
    const moves = actions.filter((action) => action.type === 'pointerMove');

    expect(actions.filter((action) => action.type === 'pointerDown')).toHaveLength(10);
    expect(actions.filter((action) => action.type === 'pointerUp')).toHaveLength(10);
    expect(moves.reduce((total, action) => total + action.duration, 0)).toBe(5920);
    expect(
      moves.every(
        (action) =>
          action.x >= bounds.x &&
          action.x <= bounds.x + bounds.width &&
          action.y >= bounds.y &&
          action.y <= bounds.y + bounds.height
      )
    ).toBe(true);
  });

  it('can repeat the native gesture sequence in one drawing session', () => {
    const bounds = nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow });
    const once = trustedGestureActions(bounds);
    const repeated = trustedGestureActions(bounds, 3);

    expect(repeated).toHaveLength(once.length * 3);
    expect(repeated.slice(0, once.length)).toEqual(once);
    expect(repeated.slice(once.length, once.length * 2)).toEqual(once);
  });

  it('can pause between repeated native gesture sequences', () => {
    const bounds = nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow });
    const repeated = trustedGestureActions(bounds, 3, 2_000);

    expect(
      repeated.filter((action) => action.type === 'pause' && action.duration === 2_000)
    ).toHaveLength(2);
  });

  it('only permits Apple-account provisioning when explicitly requested', () => {
    const base = {
      deviceId: 'device',
      xcodeConfigFile: '/tmp/local.xcconfig',
      wdaBundleId: 'art.splotch.WebDriverAgentRunner',
    };

    expect(appiumCapabilities(base)).not.toHaveProperty(
      'appium:allowProvisioningDeviceRegistration'
    );
    expect(appiumCapabilities({ ...base, allowProvisioning: true })).toHaveProperty(
      'appium:allowProvisioningDeviceRegistration',
      true
    );
  });

  it('opens the app bundle for a native capture and Safari otherwise', () => {
    const base = {
      deviceId: 'device',
      xcodeConfigFile: '/tmp/local.xcconfig',
      wdaBundleId: 'art.splotch.WebDriverAgentRunner',
    };
    const appId = JSON.parse(readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8')).appId;

    const web = appiumCapabilities(base);
    expect(web.browserName).toBe('Safari');
    expect(web).not.toHaveProperty('appium:bundleId');

    const native = appiumCapabilities({ ...base, nativeApp: true });
    expect(native['appium:bundleId']).toBe(appId);
    expect(native).not.toHaveProperty('browserName');
    expect(native).not.toHaveProperty('appium:safariInitialUrl');
  });

  it('accepts the calibrated trusted-touch signature and rejects untrusted input', () => {
    const input = {
      kinds: 'touch',
      movesPerSecond: 121,
      moveGapP95Ms: 9,
      coalescedPerMove: 0,
      trust: { share: 1 },
      pressure: { p50: 0 },
      contactWidth: { p50: 73.76 },
      contactHeight: { p50: 73.76 },
    };

    expect(inputFidelity(input).passed).toBe(true);
    expect(inputFidelity({ ...input, trust: { share: 0 } }).passed).toBe(false);
  });

  it('records the maximum live-surface area and groups boundary-size variants', () => {
    expect(
      summarizeLiveSurfaceTopology([
        { width: 683, height: 458 },
        { width: 683, height: 457 },
        { width: 683, height: 458 },
        { width: 683, height: 457 },
      ])
    ).toEqual({
      count: 4,
      sizes: [
        { width: 683, height: 458, pixels: 312_814, count: 2 },
        { width: 683, height: 457, pixels: 312_131, count: 2 },
      ],
      totalBackingPixels: 1_249_890,
      maxBackingPixels: 312_814,
      maxBackingMegapixels: 0.313,
    });
  });
});

// The probe reaches into the app's DOM by selector and cannot import its
// constants, so a rename in a component would leave a suppression reporting as
// applied while measuring nothing, or the synthetic hand unable to load a page.
// Prose cannot hold that agreement — this is the drift guard.
describe('probe selectors still match the app', () => {
  const cases = [
    ['.paper-view', () => component('DrawingCanvas.svelte'), 'class="paper-view"'],
    ['.brush-ring', () => component('PointerHalos.svelte'), 'class="brush-ring"'],
    ['.eraser-bubble', () => component('PointerHalos.svelte'), 'class="eraser-bubble"'],
    ['#coloringBookButton', () => component('ActionsPanel.svelte'), 'id="coloringBookButton"'],
    [
      '[aria-label^="Clear active coloring page:"]',
      () => component('ActivePageChip.svelte'),
      'aria-label="Clear active coloring page:',
    ],
    [
      'button[aria-label$="coloring book"]',
      () => component('ColoringBook.svelte'),
      'coloring book"',
    ],
    [
      'button[aria-label$="coloring page"]',
      () => component('ColoringBook.svelte'),
      'coloring page"',
    ],
  ];

  for (const [selector, source, marker] of cases) {
    it(`${selector} is still produced by its component`, () => {
      expect(PROBE).toContain(selector);
      expect(source()).toContain(marker);
    });
  }

  it('reads the overlay image by the id the engine module declares', () => {
    const overlay = readFileSync(join(ROOT, 'web', 'src', 'lib', 'drawing', 'overlay.ts'), 'utf8');
    const declared = /COLORING_OVERLAY_ID = '([^']+)'/.exec(overlay)?.[1];

    expect(declared).toBeTruthy();
    expect(PROBE).toContain(`COLORING_OVERLAY_ID = '${declared}'`);
  });

  // The probe's whole read of "is the coloring page showing" rests on this
  // attribute being how DrawingCanvas hides the overlay wrapper.
  it('still learns paper state from the wrapper’s hidden attribute', () => {
    expect(component('DrawingCanvas.svelte')).toContain('hidden={!overlayUrl()}');
  });

  it('waits for progressive coloring controls and decoded art before drawing', () => {
    const setupStart = PROBE.indexOf('async function coloringPageTile()');
    const setupEnd = PROBE.indexOf("// Drives the app's own coloring-book UI", setupStart);
    const setup = PROBE.slice(setupStart, setupEnd);
    const fixStart = PROBE.indexOf('async function fixPaper(need)');
    const fixEnd = PROBE.indexOf('let hand = null;', fixStart);
    const fix = PROBE.slice(fixStart, fixEnd);

    expect(setupStart).toBeGreaterThan(-1);
    expect(setup).toContain('await waitForCondition');
    expect(setup).toContain('document.querySelector(PAGE_TILE)');
    expect(fix).toContain('await waitForCondition(() => paperActive() && pageArtShowing())');
    expect(fix).not.toContain('OVERLAY_DECODE_MS');
  });

  it('shares the native screenshot persistence boundary with the action runner', () => {
    expect(ACTION_RUNNER).toContain('window.__screenshotSaveSink');
    expect(SCREENSHOT_MODULE).toContain('window.__screenshotSaveSink');
    expect(ACTION_RUNNER).not.toContain('Capacitor.nativePromise');
  });
});

describe('constants the metrics rest on', () => {
  it('flags a notable lift well above the stall floor', () => {
    expect(NOTABLE_LIFT_MS).toBeGreaterThan(STALL_FRAME_MS);
  });

  it('keeps the probe and analyzer on the same raw schema version', () => {
    const probeSchema = Number(/schema: (\d+)/.exec(PROBE)?.[1]);

    expect(probeSchema).toBe(REAL_SCREEN_SCHEMA_VERSION);
  });
});

describe('lift frames and the between-stroke window', () => {
  // A stroke ending at 200 ms, then the very next frame arrives 400 ms later —
  // the shape of a real finger-lift stall. Hand-built so the big frame is the one
  // that actually follows the lift.
  const frames = [
    [100, -1, 1],
    [116.7, 16.7, 1],
    [133.4, 16.7, 1],
    [150.1, 16.7, 1],
    [550.1, 400, 0],
    [566.8, 16.7, 0],
    [583.5, 16.7, 0],
  ];
  const events = [down(100), move(116.7), move(133.4), up(200)];
  const report = {
    meta: { measureNames: [] },
    phases: [{ key: 'p', suppress: [], startedAt: 100, endedAt: 900, contactMs: 90 }],
    frames,
    events,
    measures: [],
  };

  // The cap this replaces discarded any lift frame over 250 ms as "the page went
  // idle", which threw away the largest stalls in the capture that first
  // reproduced the reported lag.
  it('keeps a lift frame that a credibility cap would have discarded', () => {
    const [phase] = summarizeRun(report).phases;

    expect(phase.strokes.liftMs.max).toBe(400);
    expect(phase.strokes.notableLifts).toBe(1);
  });

  // Reporting only in-contact frames hid 3142 ms of lost time between strokes in a
  // real capture against 1763 ms during them.
  it('reports the between-stroke and whole-window populations too', () => {
    const [phase] = summarizeRun(report).phases;

    expect(phase.betweenStrokes.max).toBe(400);
    expect(phase.wholeWindow.max).toBe(400);
    expect(phase.pacing.max).toBeLessThan(400);
  });
});
