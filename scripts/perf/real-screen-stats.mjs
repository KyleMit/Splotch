// Turns the raw tables `real-screen-probe.js` records into the numbers a human
// reads. Pure functions, no I/O: the device driver (`perf:ipad:frames`) and the
// Playwright replication feed it the same shapes, and the maths is unit-tested
// in scripts/tests/perf-ipad-frames.test.mjs rather than trusted on a device.
//
// The probe's row schemas (see its header for the full story):
//   frames   [t, dt, contact]
//   events   [stamp, at, type, id, buttons, coalesced, onCanvas]
//   measures [start, dur, nameIndex]

// A 120 Hz ProMotion beat. The gate the drawing loop has to hit on this
// hardware; also the floor of what WebKit's ~1 ms performance.now() clamp can
// resolve, so treat a single sub-beat delta as plumbing, not precision.
export const PROMOTION_FRAME_MS = 1000 / 120;
// Two beats — one frame the display had nothing new for.
export const DROPPED_FRAME_MS = 1000 / 60;
// Long enough that a child sees the ink stop rather than stutter.
export const STALL_FRAME_MS = 50;
// Above this share of in-contact frames arriving late, pacing is the story
// rather than an occasional hiccup.
export const LATE_FRAME_SHARE_FLOOR = 0.1;
// WebKit coalesces pointermoves to about one per frame, so a drawing hand
// should deliver ~1 move per in-contact frame. Far below that means the moves
// themselves never arrived — input loss, which no amount of frame work fixes.
export const MOVES_PER_FRAME_FLOOR = 0.6;
// Input that sat this long before its handler ran is felt as lag even when
// every frame afterwards is on time.
export const QUEUE_DELAY_LAG_MS = DROPPED_FRAME_MS;
// Strokes at or past this length are the "long stroke" case; below it they are
// the rapid repeated-tap case. The two stress different paths — a long stroke
// grows one op buffer, rapid strokes pay commit + history + reactivity per
// lift — so they are summarized apart.
export const LONG_STROKE_MS = 1000;

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

export function frameStats(deltas) {
  const late = deltas.filter((delta) => delta > DROPPED_FRAME_MS);
  return {
    frames: deltas.length,
    p50: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
    max: max(deltas),
    lateShare: share(late.length, deltas.length),
    stallShare: share(deltas.filter((delta) => delta > STALL_FRAME_MS).length, deltas.length),
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
  for (const event of events) {
    if (!event[EVENT_ON_CANVAS]) continue;
    const id = event[EVENT_ID];
    const type = event[EVENT_TYPE];
    if (type === POINTER_DOWN) {
      open.set(id, { start: event[EVENT_STAMP], moves: 0, coalesced: 0, adopted: false });
    } else if (type === POINTER_MOVE && event[EVENT_BUTTONS] !== 0) {
      let stroke = open.get(id);
      if (!stroke) {
        stroke = { start: event[EVENT_STAMP], moves: 0, coalesced: 0, adopted: true };
        open.set(id, stroke);
      }
      stroke.moves++;
      stroke.coalesced += event[EVENT_COALESCED];
    } else if (type === POINTER_UP || type === POINTER_CANCEL) {
      const stroke = open.get(id);
      if (!stroke) continue;
      open.delete(id);
      strokes.push({
        start: stroke.start,
        end: event[EVENT_STAMP],
        durationMs: round(event[EVENT_STAMP] - stroke.start),
        moves: stroke.moves,
        coalesced: stroke.coalesced,
        adopted: stroke.adopted,
      });
    }
  }
  return strokes;
}

// The frame that first rendered after a stroke ended. The commit runs at
// finger-lift, off the draw path, so its cost shows up here and nowhere in the
// pacing numbers.
function hitchAfter(frames, stamp) {
  for (const frame of frames) {
    if (frame[FRAME_T] >= stamp) return frame[FRAME_DT] < 0 ? undefined : frame[FRAME_DT];
  }
  return undefined;
}

// How stale the newest input was by the time a frame ran — the delay a child
// sees as the ink trailing their finger. Walks both tables once, in step.
function paintLatencies(frames, moveStamps) {
  const latencies = [];
  let cursor = 0;
  let newest = null;
  for (const frame of frames) {
    if (!frame[FRAME_CONTACT]) continue;
    while (cursor < moveStamps.length && moveStamps[cursor] <= frame[FRAME_T]) {
      newest = moveStamps[cursor++];
    }
    if (newest !== null) latencies.push(round(frame[FRAME_T] - newest));
  }
  return latencies;
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

const inWindow = (time, from, to) => time >= from && time <= to;

export function summarizePhase(phase, { frames, events, measures, measureNames = [] }) {
  const from = phase.startedAt;
  const to = phase.endedAt ?? Infinity;
  if (from === null || from === undefined) {
    return { key: phase.key, suppress: (phase.suppress ?? []).join('+'), skipped: 'never started' };
  }

  const phaseFrames = frames.filter((frame) => inWindow(frame[FRAME_T], from, to));
  // Both ends of the interval must be in contact — the delta into the first
  // frame of a stroke carries however long the page sat idle before it.
  const contactDeltas = [];
  for (let i = 1; i < phaseFrames.length; i++) {
    const delta = phaseFrames[i][FRAME_DT];
    if (delta < 0) continue;
    if (phaseFrames[i][FRAME_CONTACT] && phaseFrames[i - 1][FRAME_CONTACT]) {
      contactDeltas.push(delta);
    }
  }

  const phaseEvents = events.filter((event) => inWindow(event[EVENT_STAMP], from, to));
  const canvasMoves = phaseEvents.filter(
    (event) =>
      event[EVENT_ON_CANVAS] && event[EVENT_TYPE] === POINTER_MOVE && event[EVENT_BUTTONS] !== 0
  );
  const queueDelays = canvasMoves.map((event) => round(event[EVENT_AT] - event[EVENT_STAMP]));
  const latencies = paintLatencies(
    phaseFrames,
    canvasMoves.map((event) => event[EVENT_STAMP])
  );

  const phaseMeasures = measures.filter((measure) => inWindow(measure[MEASURE_START], from, to));
  const contactFrames = contactDeltas.length;
  const engineMs = sum(phaseMeasures.map((measure) => measure[MEASURE_DUR]));

  // The attribution question: when a frame ran late, how much marked engine JS
  // was inside it? Near-zero says the cost is not in the drawing engine — it is
  // in rendering work (style/paint/composite) or in JS nobody marked.
  const lateWindows = [];
  for (let i = 1; i < phaseFrames.length; i++) {
    const delta = phaseFrames[i][FRAME_DT];
    if (
      delta > DROPPED_FRAME_MS &&
      phaseFrames[i][FRAME_CONTACT] &&
      phaseFrames[i - 1][FRAME_CONTACT]
    ) {
      lateWindows.push([phaseFrames[i - 1][FRAME_T], phaseFrames[i][FRAME_T]]);
    }
  }
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
  const hitches = strokes
    .map((stroke) => hitchAfter(frames, stroke.end))
    .filter((hitch) => hitch !== undefined);
  const longStrokes = strokes.filter((stroke) => stroke.durationMs >= LONG_STROKE_MS);
  const shortStrokes = strokes.filter((stroke) => stroke.durationMs < LONG_STROKE_MS);
  const trend = longStrokeTrend(longStrokes, frames);

  const movesPerFrame = contactFrames ? round(canvasMoves.length / contactFrames) : 0;
  const pacing = frameStats(contactDeltas);

  return {
    key: phase.key,
    suppress: (phase.suppress ?? []).join('+') || 'none',
    paperActive: phase.paperActive,
    halos: { seen: phase.halosSeen ?? 0, hidden: phase.halosHidden ?? null },
    contactSeconds: round((phase.contactMs ?? 0) / 1000, 1),
    pacing,
    paintLatencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
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
      maxMoveGapMs: max(
        canvasMoves
          .map((event, i) => (i === 0 ? 0 : event[EVENT_STAMP] - canvasMoves[i - 1][EVENT_STAMP]))
          .slice(1)
      ),
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
      longStrokeTrend: trend,
    },
    verdict: classifyPhase({ pacing, movesPerFrame, queueDelays, latencies }),
  };
}

// Names what the phase's numbers say, in the vocabulary the fixes divide along:
// input that never arrived, input that arrived late, and frames that came late
// with the input in hand. They feel identical to a child and have different
// fixes, which is the whole reason this probe records both sides.
export function classifyPhase({ pacing, movesPerFrame, queueDelays, latencies }) {
  const findings = [];
  if (!pacing.frames) return 'no drawing recorded';
  if (movesPerFrame < MOVES_PER_FRAME_FLOOR) findings.push('input loss');
  if ((percentile(queueDelays, 0.95) ?? 0) > QUEUE_DELAY_LAG_MS) findings.push('input queued');
  if (pacing.lateShare > LATE_FRAME_SHARE_FLOOR) findings.push('frame loss');
  if ((percentile(latencies, 0.95) ?? 0) > DROPPED_FRAME_MS && !findings.length) {
    findings.push('paint latency');
  }
  return findings.length ? findings.join(' + ') : 'clean';
}

export function summarizeRun(report) {
  const { phases = [], meta = {} } = report;
  const tables = {
    frames: report.frames ?? [],
    events: report.events ?? [],
    measures: report.measures ?? [],
    measureNames: meta.measureNames ?? [],
  };
  return phases.map((phase) => summarizePhase(phase, tables));
}

// Console-friendly projections. Three narrow tables beat one that wraps: each
// answers a different question, and the JSON artifact keeps everything.
export function pacingRows(summaries) {
  return summaries.map((phase) => ({
    phase: phase.key,
    suppressed: phase.suppress,
    'draw s': phase.contactSeconds,
    frames: phase.pacing?.frames,
    'dt p50': phase.pacing?.p50,
    'dt p95': phase.pacing?.p95,
    'dt max': phase.pacing?.max,
    'late %': phase.pacing ? round(phase.pacing.lateShare * 100, 1) : undefined,
    'stall %': phase.pacing ? round(phase.pacing.stallShare * 100, 1) : undefined,
    verdict: phase.verdict ?? phase.skipped,
  }));
}

export function inputRows(summaries) {
  return summaries.map((phase) => ({
    phase: phase.key,
    moves: phase.input?.moves,
    'mv/frame': phase.input?.movesPerFrame,
    'coal/mv': phase.input?.coalescedPerMove,
    'gap max': phase.input?.maxMoveGapMs,
    'queue p50': phase.queueDelayMs?.p50,
    'queue p95': phase.queueDelayMs?.p95,
    'paint p50': phase.paintLatencyMs?.p50,
    'paint p95': phase.paintLatencyMs?.p95,
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
    'hitch p95': phase.strokes?.endHitchP95Ms,
    'hitch max': phase.strokes?.endHitchMaxMs,
    'long start→end dt': phase.strokes?.longStrokeTrend
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
      [`Δ dt p95 vs ${baselineKey}`]: round(phase.pacing.p95 - baseline.pacing.p95),
      'Δ late %': round((phase.pacing.lateShare - baseline.pacing.lateShare) * 100, 1),
      'Δ paint p95': round((phase.paintLatencyMs.p95 ?? 0) - (baseline.paintLatencyMs.p95 ?? 0)),
      'Δ queue p95': round((phase.queueDelayMs.p95 ?? 0) - (baseline.queueDelayMs.p95 ?? 0)),
    }));
}
