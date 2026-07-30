import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';
import {
  LATE_FRAME_MULTIPLE,
  MAX_CREDIBLE_HITCH_MS,
  STALL_FRAME_MS,
  classifyPhase,
  frameStats,
  longStrokeTrend,
  observedFrameIntervalMs,
  percentile,
  segmentStrokes,
  summarizeRun,
} from '../perf/real-screen-stats.mjs';
import { probeConfigScript } from '../perf/ipad-frames.mjs';

const PROBE = readFileSync(join(ROOT, 'scripts', 'perf', 'real-screen-probe.js'), 'utf8');
const component = (name) =>
  readFileSync(join(ROOT, 'web', 'src', 'lib', 'components', name), 'utf8');

const DOWN = 0;
const MOVE = 1;
const UP = 2;

const move = (stamp, { at = stamp + 6, id = 1, buttons = 1, coalesced = 0, onCanvas = 1 } = {}) => [
  stamp,
  at,
  MOVE,
  id,
  buttons,
  coalesced,
  onCanvas,
];
const down = (stamp, id = 1) => [stamp, stamp + 6, DOWN, id, 1, 0, 1];
const up = (stamp, id = 1) => [stamp, stamp + 6, UP, id, 0, 0, 1];

// A 60 Hz capture, since that is what Safari actually gives web content on the
// ProMotion iPad this exists to measure.
const beat = (count, { from = 0, interval = 16.7, contact = 1 } = {}) =>
  Array.from({ length: count }, (_, i) => [from + i * interval, i === 0 ? -1 : interval, contact]);

describe('percentile', () => {
  it('is absent rather than zero for an empty sample', () => {
    expect(percentile([], 0.95)).toBeUndefined();
  });

  it('takes the nearest rank without interpolating', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
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
    const [phase] = summarizeRun(capture());

    expect(phase.key).toBe('page');
    expect(phase.pacing.p50).toBeCloseTo(16.7, 1);
    expect(phase.input.moves).toBe(50);
    expect(phase.strokes.count).toBe(1);
  });

  // A phase's clock runs while the finger is down, so it always ends mid-stroke;
  // windowing events first dropped the last stroke of every phase, and with it
  // the end hitch — the rapid-repeated-strokes case.
  it('claims a stroke that outlives the phase boundary', () => {
    const report = capture();
    report.phases[0].endedAt = 1300;

    expect(summarizeRun(report)[0].strokes.count).toBe(1);
  });

  it('marks a phase that never met its paper requirement as skipped', () => {
    const report = capture();
    report.phases[0].startedAt = null;

    expect(summarizeRun(report)[0].skipped).toBe('never started');
  });

  it('surfaces the observed beat on the summary set', () => {
    expect(summarizeRun(capture()).intervalMs).toBeCloseTo(16.7, 1);
  });
});

describe('probeConfigScript', () => {
  // Same guarantee as perf:ipad's overrides script, for the same reason: a
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
    const script = probeConfigScript({ phases: 'blank,page', contactMs: 20000, drive: 'mixed' });

    expect(script).toContain('window.__probePhases = "blank,page";');
    expect(script).toContain('window.__probeContactMs = 20000;');
    expect(script).toContain('window.__probeDrive = "mixed";');
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
      '[aria-label="Clear Page"]',
      () => component('ColoringBook.svelte'),
      'aria-label="Clear Page"',
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
});

describe('constants the metrics rest on', () => {
  // A hitch that is counted has to be able to register as a stall; the other way
  // round, every credible hitch would be silently below the stall floor.
  it('keeps the credible-hitch ceiling above the stall floor', () => {
    expect(MAX_CREDIBLE_HITCH_MS).toBeGreaterThan(STALL_FRAME_MS);
  });
});
