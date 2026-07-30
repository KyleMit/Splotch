// Turns the raw tables `real-screen-probe.js` records into the numbers a human
// reads. Pure functions, no I/O: the device driver (`perf:ipad:frames`), the
// re-analyzer (`perf:frames:analyze`) and the Playwright replication feed it the
// same shapes, and the maths is unit-tested in
// scripts/tests/perf-ipad-frames.test.mjs rather than trusted on a device.
//
// The probe's row schemas (see its header for the full story):
//   frames   [t, dt, contact]
//   events   [stamp, at, type, id, buttons, coalesced, onCanvas]
//   measures [start, dur, nameIndex]
//
// MEASURED ON DEVICE, and load-bearing for how everything here is defined:
// Safari gives web content a 60 Hz requestAnimationFrame beat on a 120 Hz
// ProMotion iPad Pro (iPad13,8, iPadOS 26.5) — idle and animating both sample at
// 16–17 ms. So a frame budget is never assumed; it is derived per capture from
// the deltas themselves (`observedFrameIntervalMs`). A fixed 8.33 ms budget
// reported 64% of a perfectly-paced capture as "late".

// Two beats of whatever the device's beat turns out to be — a frame the display
// had nothing new for. Below this multiple, a delta is the beat plus jitter.
export const LATE_FRAME_MULTIPLE = 1.5;
// Long enough that a child sees the ink stop rather than stutter, at any beat.
export const STALL_FRAME_MS = 50;
// Above this share of in-contact frames arriving late, pacing is the story
// rather than an occasional hiccup.
export const LATE_FRAME_SHARE_FLOOR = 0.1;
// WebKit delivers pointermoves at the digitizer's rate, which on this hardware
// runs AHEAD of the 60 Hz rAF beat — measured 1.9–4.2 moves per painted frame
// with an Apple Pencil. Far below 1 means the moves never arrived at all (input
// loss); far above 1 means the app is doing per-event work more than once per
// frame it can actually present.
export const MOVES_PER_FRAME_FLOOR = 0.6;
export const MOVES_PER_FRAME_REDUNDANT = 1.5;
// Input that sat this long before its handler ran is felt as lag even when
// every frame afterwards is on time.
export const QUEUE_DELAY_LAG_MS = 16.67;
// Strokes at or past this length are the "long stroke" case; below it they are
// the rapid repeated-tap case. The two stress different paths — a long stroke
// grows one op buffer, rapid strokes pay commit + history + reactivity per
// lift — so they are summarized apart.
export const LONG_STROKE_MS = 1000;
// Past this, the frame straddling a finger-lift is not a commit hitch: the page
// went idle because nothing was animating, and rAF simply stopped being called.
// Counted separately rather than reported as a 2.4-second hitch.
export const MAX_CREDIBLE_HITCH_MS = 250;

export const POINTER_DOWN = 0;
export const POINTER_MOVE = 1;
export const POINTER_UP = 2;
export const POINTER_CANCEL = 3;

const FRAME_T = 0;
const FRAME_DT = 1;
const FRAME_CONTACT = 2;
const EVENT_STAMP = 0;
const EVENT_AT = 1;
const EVENT_TYPE = 2;
const EVENT_ID = 3;
const EVENT_BUTTONS = 4;
const EVENT_COALESCED = 5;
const EVENT_ON_CANVAS = 6;
const MEASURE_START = 0;
const MEASURE_DUR = 1;
const MEASURE_NAME = 2;

const WORST_FRAMES_REPORTED = 12;

const round = (value, places = 2) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

// Nearest-rank on an ascending copy; `undefined` for an empty set so a missing
// sample reads as absent instead of as zero.
export function percentile(values, fraction) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return round(sorted[rank]);
}

const share = (count, total) => (total ? round(count / total, 4) : 0);
const max = (values) => (values.length ? round(Math.max(...values)) : undefined);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const inWindow = (time, from, to) => time >= from && time <= to;

// The beat this capture actually got, rather than the one the hardware claims.
// The 10th percentile, not the minimum: a single short delta is jitter, while a
// tenth of all frames landing at one interval is the beat.
export function observedFrameIntervalMs(frames) {
  const deltas = frames.filter((frame) => frame[FRAME_DT] > 0).map((frame) => frame[FRAME_DT]);
  return percentile(deltas, 0.1) ?? QUEUE_DELAY_LAG_MS;
}

export function frameStats(deltas, intervalMs) {
  const lateThreshold = intervalMs * LATE_FRAME_MULTIPLE;
  const late = deltas.filter((delta) => delta > lateThreshold);
  return {
    frames: deltas.length,
    p50: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
    p99: percentile(deltas, 0.99),
    max: max(deltas),
    lateThresholdMs: round(lateThreshold),
    lateShare: share(late.length, deltas.length),
    stallShare: share(deltas.filter((delta) => delta > STALL_FRAME_MS).length, deltas.length),
    // The frames a child actually waited through, which a share hides: 1% of a
    // long capture is still a visible freeze every few seconds.
    lostMs: round(sum(late.map((delta) => delta - intervalMs))),
  };
}

// One drawing gesture: a live contact stream on the canvas through the up/cancel
// that ends it. A stroke left open at the end of the recording is dropped rather
// than guessed at.
//
// A contact move with no preceding pointerdown OPENS a stroke rather than being
// discarded: WebKit merges a tap-then-draw into one stream and drops the down
// (the case `penStreamQuirks.ts` adopts), and those strokes paint ink, so
// leaving them out would under-report exactly the sessions that hit the quirk.
export function segmentStrokes(events) {
  const open = new Map();
  const strokes = [];
  const close = (stroke, end) => ({
    start: stroke.start,
    end,
    durationMs: round(end - stroke.start),
    moves: stroke.moves,
    coalesced: stroke.coalesced,
    adopted: stroke.adopted,
    moveStamps: stroke.moveStamps,
  });
  for (const event of events) {
    if (!event[EVENT_ON_CANVAS]) continue;
    const id = event[EVENT_ID];
    const type = event[EVENT_TYPE];
    if (type === POINTER_DOWN) {
      open.set(id, {
        start: event[EVENT_STAMP],
        moves: 0,
        coalesced: 0,
        adopted: false,
        moveStamps: [],
      });
    } else if (type === POINTER_MOVE && event[EVENT_BUTTONS] !== 0) {
      let stroke = open.get(id);
      if (!stroke) {
        stroke = {
          start: event[EVENT_STAMP],
          moves: 0,
          coalesced: 0,
          adopted: true,
          moveStamps: [],
        };
        open.set(id, stroke);
      }
      stroke.moves++;
      stroke.coalesced += event[EVENT_COALESCED];
      stroke.moveStamps.push(event[EVENT_STAMP]);
    } else if (type === POINTER_UP || type === POINTER_CANCEL) {
      const stroke = open.get(id);
      if (!stroke) continue;
      open.delete(id);
      strokes.push(close(stroke, event[EVENT_STAMP]));
    }
  }
  return strokes;
}

// The frame that first rendered after a stroke ended — where the commit runs,
// off the draw path, invisible to the pacing numbers. Past
// MAX_CREDIBLE_HITCH_MS it is not a hitch at all but the page going idle with
// nothing left to animate, so those are counted, not averaged in.
function endHitches(strokes, frames) {
  const hitches = [];
  let idleAfterLift = 0;
  for (const stroke of strokes) {
    const frame = frames.find((row) => row[FRAME_T] >= stroke.end);
    if (!frame || frame[FRAME_DT] < 0) continue;
    if (frame[FRAME_DT] > MAX_CREDIBLE_HITCH_MS) idleAfterLift++;
    else hitches.push(frame[FRAME_DT]);
  }
  return { hitches, idleAfterLift };
}

// How long a child waits between moving their finger and the next frame that
// could show it. Measured per MOVE (not per frame) and only for moves that have
// another move after them in the same stroke: the last move of a stroke is
// followed by a finger-lift, and the idle gap after that is not latency.
function paintLatencies(strokes, frames) {
  const latencies = [];
  let cursor = 0;
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.moveStamps.length - 1; i++) {
      const stamp = stroke.moveStamps[i];
      while (cursor < frames.length && frames[cursor][FRAME_T] < stamp) cursor++;
      if (cursor >= frames.length) return latencies;
      latencies.push(round(frames[cursor][FRAME_T] - stamp));
    }
  }
  return latencies;
}

// Gaps BETWEEN moves inside one stroke. Measured per stroke because the gap
// across a stroke boundary is the human pausing, which reported as a 4.5-second
// input gap in the first capture.
function moveGaps(strokes) {
  const gaps = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.moveStamps.length; i++) {
      gaps.push(round(stroke.moveStamps[i] - stroke.moveStamps[i - 1]));
    }
  }
  return gaps;
}

// Does a stroke get slower the longer it goes? Compares the first third of each
// long stroke's frames against its last third: an op buffer, a snapshot, or a
// blend layer whose cost grows with the stroke shows up as a widening delta
// while a fixed per-event cost does not. Reported as a ratio so strokes of
// different lengths can be pooled.
export function longStrokeTrend(longStrokes, frames) {
  const first = [];
  const last = [];
  for (const stroke of longStrokes) {
    const deltas = [];
    for (let i = 1; i < frames.length; i++) {
      const time = frames[i][FRAME_T];
      if (time < stroke.start) continue;
      if (time > stroke.end) break;
      if (frames[i][FRAME_DT] >= 0 && frames[i][FRAME_CONTACT] && frames[i - 1][FRAME_CONTACT]) {
        deltas.push(frames[i][FRAME_DT]);
      }
    }
    const third = Math.floor(deltas.length / 3);
    if (third < 2) continue;
    first.push(...deltas.slice(0, third));
    last.push(...deltas.slice(-third));
  }
  const firstP50 = percentile(first, 0.5);
  const lastP50 = percentile(last, 0.5);
  return {
    strokes: longStrokes.length,
    firstThirdP50: firstP50,
    lastThirdP50: lastP50,
    ratio: firstP50 && lastP50 ? round(lastP50 / firstP50) : undefined,
  };
}

function measureBreakdown(measures, names) {
  const byName = new Map();
  for (const measure of measures) {
    const name = names[measure[MEASURE_NAME]] ?? `#${measure[MEASURE_NAME]}`;
    const entry = byName.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    entry.count++;
    entry.totalMs = round(entry.totalMs + measure[MEASURE_DUR]);
    entry.maxMs = Math.max(entry.maxMs, measure[MEASURE_DUR]);
    byName.set(name, entry);
  }
  return Object.fromEntries([...byName].sort(([a], [b]) => a.localeCompare(b)));
}

// The forensic list: the worst frames in a phase, each with what surrounded it.
// A share and a p99 say a freeze happened; this says WHERE — mid-stroke, at
// finger-lift, right after a stroke started — and what marked work was inside
// it. That is the difference between "there are stalls" and a named cause.
export function worstFrames(phaseSummaryInput, limit = WORST_FRAMES_REPORTED) {
  const { frames, events, measures, measureNames, from, to } = phaseSummaryInput;
  const rows = [];
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    if (!inWindow(frame[FRAME_T], from, to)) continue;
    if (frame[FRAME_DT] < 0) continue;
    rows.push({
      index: i,
      start: frames[i - 1][FRAME_T],
      end: frame[FRAME_T],
      dt: frame[FRAME_DT],
    });
  }
  rows.sort((a, b) => b.dt - a.dt);
  const canvasEvents = events.filter((event) => event[EVENT_ON_CANVAS]);
  return rows.slice(0, limit).map((row) => {
    const inside = measures.filter((measure) =>
      inWindow(measure[MEASURE_START], row.start, row.end)
    );
    const movesInside = canvasEvents.filter(
      (event) =>
        event[EVENT_TYPE] === POINTER_MOVE && inWindow(event[EVENT_STAMP], row.start, row.end)
    ).length;
    const previous = [...canvasEvents].reverse().find((event) => event[EVENT_STAMP] <= row.start);
    const kind = previous ? ['down', 'move', 'up', 'cancel'][previous[EVENT_TYPE]] : 'none';
    return {
      'dt ms': round(row.dt),
      'at s': round((row.start - from) / 1000, 1),
      after: `${kind} +${round(row.start - (previous?.[EVENT_STAMP] ?? row.start))}ms`,
      moves: movesInside,
      'engine ms': round(sum(inside.map((measure) => measure[MEASURE_DUR]))),
      marks:
        Object.entries(measureBreakdown(inside, measureNames))
          .map(([name, entry]) => `${name.replace('engine.', '')}×${entry.count}`)
          .join(' ') || '—',
    };
  });
}

export function summarizePhase(phase, tables) {
  const { frames, events, measures, measureNames = [], intervalMs } = tables;
  const from = phase.startedAt;
  const to = phase.endedAt ?? Infinity;
  if (from === null || from === undefined) {
    return { key: phase.key, suppress: (phase.suppress ?? []).join('+'), skipped: 'never started' };
  }

  const phaseFrames = frames.filter((frame) => inWindow(frame[FRAME_T], from, to));
  // Both ends of the interval must be in contact — the delta into the first
  // frame of a stroke carries however long the page sat idle before it.
  const contactDeltas = [];
  const lateWindows = [];
  const lateThreshold = intervalMs * LATE_FRAME_MULTIPLE;
  for (let i = 1; i < phaseFrames.length; i++) {
    const delta = phaseFrames[i][FRAME_DT];
    if (delta < 0) continue;
    if (!phaseFrames[i][FRAME_CONTACT] || !phaseFrames[i - 1][FRAME_CONTACT]) continue;
    contactDeltas.push(delta);
    if (delta > lateThreshold)
      lateWindows.push([phaseFrames[i - 1][FRAME_T], phaseFrames[i][FRAME_T]]);
  }

  const phaseEvents = events.filter((event) => inWindow(event[EVENT_STAMP], from, to));
  const canvasMoves = phaseEvents.filter(
    (event) =>
      event[EVENT_ON_CANVAS] && event[EVENT_TYPE] === POINTER_MOVE && event[EVENT_BUTTONS] !== 0
  );
  const queueDelays = canvasMoves.map((event) => round(event[EVENT_AT] - event[EVENT_STAMP]));

  const phaseMeasures = measures.filter((measure) => inWindow(measure[MEASURE_START], from, to));
  const contactFrames = contactDeltas.length;
  const engineMs = sum(phaseMeasures.map((measure) => measure[MEASURE_DUR]));

  // The attribution question: when a frame ran late, how much marked engine JS
  // was inside it? Near-zero says the cost is not in the drawing engine — it is
  // in rendering work (style/paint/composite) or in JS nobody marked.
  const engineMsInLate = sum(
    phaseMeasures
      .filter((measure) =>
        lateWindows.some(([start, end]) => inWindow(measure[MEASURE_START], start, end))
      )
      .map((measure) => measure[MEASURE_DUR])
  );

  // Strokes are segmented over the WHOLE recording and then claimed by the
  // phase their pointerdown fell in: a phase always ends mid-stroke (its clock
  // runs while the finger is down), so windowing the events first would drop the
  // last stroke of every phase — and with it the stroke-end hitch, which is
  // exactly what a rapid-repeated-strokes complaint is about.
  const strokes = segmentStrokes(events).filter((stroke) => inWindow(stroke.start, from, to));
  const { hitches, idleAfterLift } = endHitches(strokes, frames);
  const latencies = paintLatencies(strokes, frames);
  const gaps = moveGaps(strokes);
  const longStrokes = strokes.filter((stroke) => stroke.durationMs >= LONG_STROKE_MS);
  const shortStrokes = strokes.filter((stroke) => stroke.durationMs < LONG_STROKE_MS);
  const trend = longStrokeTrend(longStrokes, frames);

  const movesPerFrame = contactFrames ? round(canvasMoves.length / contactFrames) : 0;
  const pacing = frameStats(contactDeltas, intervalMs);

  return {
    key: phase.key,
    suppress: (phase.suppress ?? []).join('+') || 'none',
    paperActive: phase.paperActive,
    abandoned: phase.abandoned ?? false,
    halos: { seen: phase.halosSeen ?? 0, hidden: phase.halosHidden ?? null },
    contactSeconds: round((phase.contactMs ?? 0) / 1000, 1),
    pacing,
    paintLatencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: max(latencies),
    },
    queueDelayMs: {
      p50: percentile(queueDelays, 0.5),
      p95: percentile(queueDelays, 0.95),
      max: max(queueDelays),
    },
    input: {
      moves: canvasMoves.length,
      movesPerFrame,
      coalescedPerMove: canvasMoves.length
        ? round(sum(canvasMoves.map((event) => event[EVENT_COALESCED])) / canvasMoves.length)
        : 0,
      moveGapP95Ms: percentile(gaps, 0.95),
      moveGapMaxMs: max(gaps),
    },
    engine: {
      msPerFrame: contactFrames ? round(engineMs / contactFrames) : 0,
      msPerLateFrame: lateWindows.length ? round(engineMsInLate / lateWindows.length) : 0,
      lateFrames: lateWindows.length,
      byName: measureBreakdown(phaseMeasures, measureNames),
    },
    strokes: {
      count: strokes.length,
      long: longStrokes.length,
      short: shortStrokes.length,
      // Strokes WebKit delivered with no pointerdown — the merged-stream quirk.
      // A non-zero count here is an input-delivery finding in its own right.
      adopted: strokes.filter((stroke) => stroke.adopted).length,
      movesPerLongStroke: longStrokes.length
        ? round(sum(longStrokes.map((stroke) => stroke.moves)) / longStrokes.length)
        : 0,
      endHitchP95Ms: percentile(hitches, 0.95),
      endHitchMaxMs: max(hitches),
      idleAfterLift,
      longStrokeTrend: trend,
    },
    worstFrames: worstFrames({ frames, events, measures, measureNames, from, to }),
    verdict: classifyPhase({ pacing, movesPerFrame, queueDelays, latencies, intervalMs }),
  };
}

// Names what the phase's numbers say, in the vocabulary the fixes divide along:
// input that never arrived, input that arrived late, frames that came late with
// the input in hand, and per-event work the app repeats within one frame it can
// present. They feel identical to a child and have different fixes, which is the
// whole reason this probe records both sides.
export function classifyPhase({ pacing, movesPerFrame, queueDelays, latencies, intervalMs }) {
  const findings = [];
  if (!pacing.frames) return 'no drawing recorded';
  if (movesPerFrame < MOVES_PER_FRAME_FLOOR) findings.push('input loss');
  if (movesPerFrame > MOVES_PER_FRAME_REDUNDANT) findings.push('redundant per-event work');
  if ((percentile(queueDelays, 0.95) ?? 0) > QUEUE_DELAY_LAG_MS) findings.push('input queued');
  if (pacing.lateShare > LATE_FRAME_SHARE_FLOOR) findings.push('frame loss');
  else if (pacing.stallShare > 0) findings.push('stalls');
  if ((percentile(latencies, 0.95) ?? 0) > intervalMs * LATE_FRAME_MULTIPLE) {
    findings.push('paint latency');
  }
  return findings.length ? findings.join(' + ') : 'clean';
}

export function summarizeRun(report) {
  const { phases = [], meta = {} } = report;
  const frames = report.frames ?? [];
  const tables = {
    frames,
    events: report.events ?? [],
    measures: report.measures ?? [],
    measureNames: meta.measureNames ?? [],
    intervalMs: observedFrameIntervalMs(frames),
  };
  const summaries = phases.map((phase) => summarizePhase(phase, tables));
  summaries.intervalMs = tables.intervalMs;
  return summaries;
}

// Console-friendly projections. Narrow tables beat one that wraps: each answers
// a different question, and the JSON artifact keeps everything.
export function pacingRows(summaries) {
  return summaries.map((phase) => ({
    phase: phase.key,
    suppressed: phase.suppress,
    'draw s': phase.contactSeconds,
    frames: phase.pacing?.frames,
    'dt p50': phase.pacing?.p50,
    'dt p95': phase.pacing?.p95,
    'dt p99': phase.pacing?.p99,
    'dt max': phase.pacing?.max,
    'late %': phase.pacing ? round(phase.pacing.lateShare * 100, 1) : undefined,
    'stall %': phase.pacing ? round(phase.pacing.stallShare * 100, 1) : undefined,
    'lost ms': phase.pacing?.lostMs,
    verdict: phase.verdict ?? phase.skipped,
  }));
}

export function inputRows(summaries) {
  return summaries.map((phase) => ({
    phase: phase.key,
    moves: phase.input?.moves,
    'mv/frame': phase.input?.movesPerFrame,
    'coal/mv': phase.input?.coalescedPerMove,
    'gap p95': phase.input?.moveGapP95Ms,
    'gap max': phase.input?.moveGapMaxMs,
    'queue p50': phase.queueDelayMs?.p50,
    'queue p95': phase.queueDelayMs?.p95,
    'paint p50': phase.paintLatencyMs?.p50,
    'paint p95': phase.paintLatencyMs?.p95,
    'paint p99': phase.paintLatencyMs?.p99,
    'paint max': phase.paintLatencyMs?.max,
  }));
}

export function engineRows(summaries) {
  return summaries.map((phase) => ({
    phase: phase.key,
    'js/frame': phase.engine?.msPerFrame,
    'late frames': phase.engine?.lateFrames,
    'js/late frame': phase.engine?.msPerLateFrame,
    'draw max': phase.engine?.byName?.['engine.draw']?.maxMs,
    'commit max': phase.engine?.byName?.['engine.commit']?.maxMs,
    strokes: phase.strokes?.count,
    'long/short': phase.strokes ? `${phase.strokes.long}/${phase.strokes.short}` : undefined,
    adopted: phase.strokes?.adopted,
    'hitch p95': phase.strokes?.endHitchP95Ms,
    'hitch max': phase.strokes?.endHitchMaxMs,
    'long dt 1st→3rd': phase.strokes?.longStrokeTrend
      ? `${phase.strokes.longStrokeTrend.firstThirdP50 ?? '–'}→${phase.strokes.longStrokeTrend.lastThirdP50 ?? '–'}`
      : undefined,
  }));
}

// What each suppression bought against the phase it is a variant of, which is
// the attribution the whole sweep exists for.
export function comparisonRows(summaries, baselineKey = 'page') {
  const baseline = summaries.find((phase) => phase.key === baselineKey);
  if (!baseline?.pacing) return [];
  return summaries
    .filter((phase) => phase.key !== baselineKey && phase.pacing)
    .map((phase) => ({
      phase: phase.key,
      [`Δ paint p95 vs ${baselineKey}`]: round(
        (phase.paintLatencyMs.p95 ?? 0) - (baseline.paintLatencyMs.p95 ?? 0)
      ),
      'Δ paint p99': round((phase.paintLatencyMs.p99 ?? 0) - (baseline.paintLatencyMs.p99 ?? 0)),
      'Δ dt p95': round((phase.pacing.p95 ?? 0) - (baseline.pacing.p95 ?? 0)),
      'Δ late %': round((phase.pacing.lateShare - baseline.pacing.lateShare) * 100, 1),
      'Δ lost ms': round(phase.pacing.lostMs - baseline.pacing.lostMs),
      'Δ stall %': round((phase.pacing.stallShare - baseline.pacing.stallShare) * 100, 1),
    }));
}
