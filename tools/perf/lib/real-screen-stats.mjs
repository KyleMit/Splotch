// Turns the raw tables `real-screen-probe.js` records into the numbers a human
// reads. Pure functions, no I/O: the device driver (`perf:ios:webkit:frames`), the
// re-analyzer (`perf:analyze:frames`) and the Playwright replication feed it the
// same shapes, and the maths is unit-tested in
// tools/perf/tests/real-screen.test.mjs rather than trusted on a device.
//
// The probe's row schemas (see its header for the full story). Columns are read
// by POSITION here, so this list and the probe's writers move together:
//   frames   [t, dt, contact]
//   events   [stamp, at, type, id, buttons, coalesced, onCanvas, kind,
//             trusted, pressure, width, height, coalescedFirst, coalescedLast]
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
const LATE_FRAME_SHARE_FLOOR = 0.1;
// WebKit delivers pointermoves at the digitizer's rate, which on this hardware
// runs AHEAD of the 60 Hz rAF beat — measured 1.9–4.2 moves per painted frame
// with an Apple Pencil. Far below 1 means the moves never arrived at all (input
// loss); far above 1 means the app is doing per-event work more than once per
// frame it can actually present.
const MOVES_PER_FRAME_FLOOR = 0.6;
const MOVES_PER_FRAME_REDUNDANT = 1.5;
// Input that sat this long before its handler ran is felt as lag even when
// every frame afterwards is on time.
export const QUEUE_DELAY_LAG_MS = 16.67;
// Strokes at or past this length are the "long stroke" case; below it they are
// the rapid repeated-tap case. The two stress different paths — a long stroke
// grows one op buffer, rapid strokes pay commit + history + reactivity per
// lift — so they are summarized apart.
const LONG_STROKE_MS = 1000;
// NOT a cap on what counts as a hitch. An earlier version discarded any
// finger-lift frame above 250 ms as "the page went idle with nothing to animate",
// which was wrong twice over: the ceiling measurement shows rAF firing at ~17 ms
// on a completely idle page, and a hand capture recorded 13,195 frames BETWEEN
// strokes at a steady 17 ms p50 — rAF never stops. The cap was silently throwing
// away the largest stalls in the capture (a 487 ms lift, and every 250-568 ms one
// in the run that first reproduced the reported lag). Lift frames are now reported
// whole; this only marks the ones worth calling out.
export const NOTABLE_LIFT_MS = 100;
// Four missed presentation opportunities distinguishes a visible freeze from
// ordinary scheduling jitter. This only selects forensic episodes; the gate
// uses cumulative lost frame time without a cliff.
export const STARVATION_FRAME_MULTIPLE = 4;
// Compositor work in the device traces began up to 192 ms after commit closed.
// Attribution is reported, never used to discard an otherwise valid episode.
const STARVATION_ATTRIBUTION_WINDOW_MS = 250;
export const REAL_SCREEN_SCHEMA_VERSION = 2;

const POINTER_DOWN = 0;
const POINTER_MOVE = 1;
const POINTER_UP = 2;
const POINTER_CANCEL = 3;

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
const EVENT_KIND = 7;
const EVENT_TRUSTED = 8;
const EVENT_PRESSURE = 9;
const EVENT_WIDTH = 10;
const EVENT_HEIGHT = 11;
const EVENT_COALESCED_FIRST = 12;
const EVENT_COALESCED_LAST = 13;
const POINTER_KIND_NAMES = ['touch', 'pen', 'mouse'];
const LAST_TRUSTED_CONTACT_KIND = 1;
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

// Absence propagates rather than collapsing to zero: `percentile` returns
// undefined for an empty sample on purpose, and a `?? 0` here turned a phase that
// banked no strokes into a clean win under a table captioned "negative is better".
const delta = (value, against) =>
  value === undefined || against === undefined ? undefined : round(value - against);

const share = (count, total) => (total ? round(count / total, 4) : 0);
const max = (values) => (values.length ? round(Math.max(...values)) : undefined);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const inWindow = (time, from, to) => time >= from && time <= to;

// The beat this capture actually got, rather than the one the hardware claims.
//
// The DOMINANT INTERVAL, not a low percentile. Every physical browser measured
// so far presents at more than one rate inside a single capture, and a low
// percentile answers "the fastest rate this display ever visited" rather than
// "the rate it held":
//
//   * Chrome on a 120 Hz Android phone raises the rate while a touch gesture is
//     in progress and lets it fall back to 60 Hz. A capture is a mix of 8.3 ms
//     and 16.6 ms frames with nothing in between.
//   * Safari on a ProMotion iPad runs web content at 60 Hz but emits a short
//     frame now and then. A physical-iPad pen capture put ~2.6% of its frames at
//     or under 12 ms on an otherwise 16-17 ms beat, which dragged the 10th
//     percentile to 14 ms.
//
// Both make the derived budget too small, and `frameStats` then charges the app
// for frames that arrived on the beat the display was actually holding. On that
// iPad capture the 10th percentile scored 1.67% of in-contact frame time as
// lost against a 1% gate; the dominant interval scores 0.11%.
//
// Buckets are half-milliseconds — finer splits one refresh rate across
// neighbouring buckets and stops any of them dominating. A capture with no
// dominant interval is genuinely erratic rather than multi-rate, and there the
// old percentile remains the better answer.
const BEAT_BUCKET_MS = 0.5;
const BEAT_MODE_SHARE_FLOOR = 0.25;

export function observedFrameIntervalMs(frames) {
  const deltas = frames.filter((frame) => frame[FRAME_DT] > 0).map((frame) => frame[FRAME_DT]);
  if (!deltas.length) return QUEUE_DELAY_LAG_MS;
  const buckets = new Map();
  for (const delta of deltas) {
    const bucket = Math.round(delta / BEAT_BUCKET_MS) * BEAT_BUCKET_MS;
    const members = buckets.get(bucket);
    if (members) members.push(delta);
    else buckets.set(bucket, [delta]);
  }
  let dominant = [];
  for (const members of buckets.values()) {
    if (members.length > dominant.length) dominant = members;
  }
  // The bucket's own median rather than its centre, so the returned beat stays a
  // delta the capture actually contained and every threshold derived from it
  // keeps its original precision.
  if (dominant.length / deltas.length >= BEAT_MODE_SHARE_FLOOR) return percentile(dominant, 0.5);
  return percentile(deltas, 0.1) ?? QUEUE_DELAY_LAG_MS;
}

export function frameStats(deltas, intervalMs) {
  const budgetMs = Math.min(intervalMs, QUEUE_DELAY_LAG_MS);
  const lateThreshold = budgetMs * LATE_FRAME_MULTIPLE;
  const late = deltas.filter((delta) => delta > lateThreshold);
  const elapsedMs = round(sum(deltas));
  const lostMs = round(sum(late.map((delta) => delta - budgetMs)));
  return {
    frames: deltas.length,
    p50: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
    p99: percentile(deltas, 0.99),
    max: max(deltas),
    budgetMs: round(budgetMs),
    lateThresholdMs: round(lateThreshold),
    lateShare: share(late.length, deltas.length),
    stallShare: share(deltas.filter((delta) => delta > STALL_FRAME_MS).length, deltas.length),
    // The frames a child actually waited through, which a share hides: 1% of a
    // long capture is still a visible freeze every few seconds.
    elapsedMs,
    lostMs,
    lostFrameTimeShare: elapsedMs ? round(lostMs / elapsedMs, 4) : undefined,
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

// The frame that first rendered after a stroke ended — where the commit runs, off
// the draw path and outside the in-contact pacing numbers entirely. This is where
// the reported lag turned out to live (250-568 ms frames at `up +2..22ms`), so
// nothing here is filtered: every lift frame is kept whole.
//
// Counts are reported as a RATE rather than a percentile. A phase holds only 20-40
// strokes, so a p95 over them is the second-worst sample dressed up as a
// distribution — two otherwise identical device runs disagreed about whether the
// pointer halos cost 100 ms at each lift purely because one phase had 19 strokes
// and the next had 27.
function endHitches(strokes, frames) {
  const hitches = [];
  for (const stroke of strokes) {
    const frame = frames.find((row) => row[FRAME_T] >= stroke.end);
    if (!frame || frame[FRAME_DT] < 0) continue;
    hitches.push(frame[FRAME_DT]);
  }
  return { hitches, notableLifts: hitches.filter((ms) => ms > NOTABLE_LIFT_MS).length };
}

// How long a child waits between moving their finger and the next frame that
// could show it. Measured per MOVE (not per frame) and only for moves that have
// another move after them in the same stroke: the last move of a stroke is
// followed by a finger-lift, and the idle gap after that is not latency.
// Flattened and sorted before the walk, because `segmentStrokes` emits strokes in
// LIFT order (they are pushed at the pointerup that closes them) while the cursor
// only ever moves forward. Two contacts on the paper at once — a palm plus a
// finger, routine for a toddler — put the earlier-STARTING stroke after the one
// that lifted first, and its moves then matched frames seconds later: a measured
// p95 of 3056 ms against 0 for the same input on one pointer, which also
// fabricated a `paint latency` verdict in classifyPhase.
function paintLatencies(strokes, frames) {
  const stamps = strokes.flatMap((stroke) => stroke.moveStamps.slice(0, -1)).sort((a, b) => a - b);
  const latencies = [];
  let cursor = 0;
  for (const stamp of stamps) {
    while (cursor < frames.length && frames[cursor][FRAME_T] < stamp) cursor++;
    if (cursor >= frames.length) return latencies;
    latencies.push(round(frames[cursor][FRAME_T] - stamp));
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

function coveredDurationMs(measures, from, to) {
  const intervals = measures
    .map((measure) => [
      Math.max(from, measure[MEASURE_START]),
      Math.min(to, measure[MEASURE_START] + measure[MEASURE_DUR]),
    ])
    .filter(([start, end]) => end > start)
    .sort(([a], [b]) => a - b);
  let covered = 0;
  let currentStart;
  let currentEnd;
  for (const [start, end] of intervals) {
    if (currentStart === undefined) {
      currentStart = start;
      currentEnd = end;
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      covered += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  if (currentStart !== undefined) covered += currentEnd - currentStart;
  return round(covered);
}

function nearestAttribution(signals, start, end) {
  const candidates = signals
    .map((signal) => {
      const distance =
        signal.at < start ? start - signal.at : signal.at > end ? signal.at - end : 0;
      return { ...signal, distance };
    })
    .filter((signal) => signal.distance <= STARVATION_ATTRIBUTION_WINDOW_MS)
    .sort(
      (a, b) =>
        a.distance - b.distance || Math.abs(a.at - start) - Math.abs(b.at - start) || a.at - b.at
    );
  const nearest = candidates[0];
  return nearest
    ? {
        index: nearest.index,
        atMs: round(nearest.at),
        offsetFromStartMs: round(nearest.at - start),
        distanceMs: round(nearest.distance),
      }
    : undefined;
}

export function starvationEpisodes({
  frames,
  events,
  measures,
  measureNames = [],
  intervalMs = observedFrameIntervalMs(frames),
  from = -Infinity,
  to = Infinity,
}) {
  const budgetMs = Math.min(intervalMs, QUEUE_DELAY_LAG_MS);
  const thresholdMs = budgetMs * STARVATION_FRAME_MULTIPLE;
  const trustedContactMoves = events.filter(
    (event) =>
      event[EVENT_ON_CANVAS] &&
      event[EVENT_TYPE] === POINTER_MOVE &&
      event[EVENT_BUTTONS] !== 0 &&
      event[EVENT_KIND] <= LAST_TRUSTED_CONTACT_KIND &&
      event[EVENT_TRUSTED] === 1
  );
  const lifts = events
    .filter(
      (event) =>
        event[EVENT_ON_CANVAS] &&
        event[EVENT_TYPE] === POINTER_UP &&
        event[EVENT_KIND] <= LAST_TRUSTED_CONTACT_KIND &&
        event[EVENT_TRUSTED] === 1
    )
    .map((event, index) => ({ index, at: event[EVENT_AT] }));
  const commits = measures
    .map((measure, index) => ({ measure, index }))
    .filter(({ measure }) => measureNames[measure[MEASURE_NAME]] === 'engine.commit')
    .map(({ measure, index }) => ({ index, at: measure[MEASURE_START] + measure[MEASURE_DUR] }));
  const episodes = [];

  for (let index = 1; index < frames.length; index++) {
    const previous = frames[index - 1];
    const frame = frames[index];
    const start = previous[FRAME_T];
    const end = frame[FRAME_T];
    const gapMs = frame[FRAME_DT];
    if (!inWindow(start, from, to) || !inWindow(end, from, to) || gapMs <= thresholdMs) continue;

    const moves = trustedContactMoves.filter((event) => inWindow(event[EVENT_AT], start, end));
    const engineMs = coveredDurationMs(measures, start, end);
    const engineShare = engineMs / gapMs;

    episodes.push({
      frameIndex: index,
      startMs: round(start),
      endMs: round(end),
      gapMs: round(gapMs),
      starvationMs: round(Math.max(0, gapMs - budgetMs - engineMs)),
      population: previous[FRAME_CONTACT] && frame[FRAME_CONTACT] ? 'inContact' : 'betweenStrokes',
      trustedMoves: moves.length,
      trustedPointerKinds: [
        ...new Set(moves.map((event) => POINTER_KIND_NAMES[event[EVENT_KIND]]).filter(Boolean)),
      ],
      engineMs,
      engineShare: round(engineShare, 4),
      nearestLift: nearestAttribution(lifts, start, end),
      nearestCommit: nearestAttribution(commits, start, end),
    });
  }

  return episodes;
}

function starvationPopulation(episodes, commitCount, pacing) {
  const starvationMs = round(sum(episodes.map((episode) => episode.starvationMs)));
  const attributedCommits = new Set(
    episodes.map((episode) => episode.nearestCommit?.index).filter((index) => index !== undefined)
  );
  return {
    episodes: episodes.length,
    episodesPerCommit: commitCount ? round(episodes.length / commitCount, 4) : undefined,
    starvationMs,
    lostFrameTimeMs: pacing.lostMs,
    lostFrameTimeShare: pacing.lostFrameTimeShare,
    worstFrameGapMs: max(episodes.map((episode) => episode.gapMs)),
    commitsFollowedByStarvation: attributedCommits.size,
    commits: commitCount,
  };
}

// The forensic list: the worst frames in a phase, each with what surrounded it.
// A share and a p99 say a freeze happened; this says WHERE — mid-stroke, at
// finger-lift, right after a stroke started — and what marked work was inside
// it. That is the difference between "there are stalls" and a named cause.
function worstFrames(phaseSummaryInput, limit = WORST_FRAMES_REPORTED) {
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

function summarizePhase(phase, tables) {
  const { frames, events, measures, measureNames = [], intervalMs } = tables;
  const from = phase.startedAt;
  const to = phase.endedAt ?? Infinity;
  if (from === null || from === undefined) {
    return { key: phase.key, suppress: (phase.suppress ?? []).join('+'), skipped: 'never started' };
  }

  const phaseFrames = frames.filter((frame) => inWindow(frame[FRAME_T], from, to));
  // THREE populations, because reporting only the first hid where the lag actually
  // was. `contact` is the stroke itself (both ends of the interval in contact — the
  // delta into a stroke's first frame carries whatever preceded it). `between` is
  // the rest of the window, which is where the finger-lift stalls live: a hand
  // capture spent 3142 ms of lost time between strokes against 1763 ms during them,
  // and only the second number was on the table.
  const contactDeltas = [];
  const betweenDeltas = [];
  const allDeltas = [];
  const lateWindows = [];
  const lateThreshold = intervalMs * LATE_FRAME_MULTIPLE;
  for (let i = 1; i < phaseFrames.length; i++) {
    const delta = phaseFrames[i][FRAME_DT];
    if (delta < 0) continue;
    allDeltas.push(delta);
    const drawing = phaseFrames[i][FRAME_CONTACT] && phaseFrames[i - 1][FRAME_CONTACT];
    (drawing ? contactDeltas : betweenDeltas).push(delta);
    // Attribution windows span the whole phase now, not just the stroke: the worst
    // frames sit at the lift, which is not an in-contact interval.
    if (delta > lateThreshold) {
      lateWindows.push([phaseFrames[i - 1][FRAME_T], phaseFrames[i][FRAME_T]]);
    }
  }

  const phaseEvents = events.filter((event) => inWindow(event[EVENT_STAMP], from, to));
  const canvasMoves = phaseEvents.filter(
    (event) =>
      event[EVENT_ON_CANVAS] && event[EVENT_TYPE] === POINTER_MOVE && event[EVENT_BUTTONS] !== 0
  );
  const queueDelays = canvasMoves.map((event) => round(event[EVENT_AT] - event[EVENT_STAMP]));
  const trustedMoves = canvasMoves.filter((event) => event[EVENT_TRUSTED] === 1).length;
  const untrustedMoves = canvasMoves.filter((event) => event[EVENT_TRUSTED] === 0).length;
  const unknownTrustMoves = canvasMoves.length - trustedMoves - untrustedMoves;
  const pressure = canvasMoves
    .map((event) => event[EVENT_PRESSURE])
    .filter((value) => Number.isFinite(value));
  const widths = canvasMoves
    .map((event) => event[EVENT_WIDTH])
    .filter((value) => Number.isFinite(value));
  const heights = canvasMoves
    .map((event) => event[EVENT_HEIGHT])
    .filter((value) => Number.isFinite(value));
  const coalescedSpans = canvasMoves
    .filter((event) => event[EVENT_COALESCED_FIRST] >= 0 && event[EVENT_COALESCED_LAST] >= 0)
    .map((event) => round(event[EVENT_COALESCED_LAST] - event[EVENT_COALESCED_FIRST]));

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
  const { hitches, notableLifts } = endHitches(strokes, frames);
  const latencies = paintLatencies(strokes, frames);
  const gaps = moveGaps(strokes);
  const longStrokes = strokes.filter((stroke) => stroke.durationMs >= LONG_STROKE_MS);
  const shortStrokes = strokes.filter((stroke) => stroke.durationMs < LONG_STROKE_MS);
  const trend = longStrokeTrend(longStrokes, frames);

  const movesPerFrame = contactFrames ? round(canvasMoves.length / contactFrames) : 0;
  const contactSeconds = (phase.contactMs ?? 0) / 1000;
  const pacing = frameStats(contactDeltas, intervalMs);
  const betweenStrokes = frameStats(betweenDeltas, intervalMs);
  const wholeWindow = frameStats(allDeltas, intervalMs);
  const commits = phaseMeasures.filter(
    (measure) => measureNames[measure[MEASURE_NAME]] === 'engine.commit'
  );
  const episodes = starvationEpisodes({
    frames,
    events,
    measures,
    measureNames,
    intervalMs,
    from,
    to,
  });

  return {
    key: phase.key,
    suppress: (phase.suppress ?? []).join('+') || 'none',
    paperActive: phase.paperActive,
    abandoned: phase.abandoned ?? false,
    halos: { seen: phase.halosSeen ?? 0, hidden: phase.halosHidden ?? null },
    contactSeconds: round(contactSeconds, 1),
    pacing,
    betweenStrokes,
    wholeWindow,
    starvation: {
      thresholdMs: round(Math.min(intervalMs, QUEUE_DELAY_LAG_MS) * STARVATION_FRAME_MULTIPLE),
      attributionWindowMs: STARVATION_ATTRIBUTION_WINDOW_MS,
      all: starvationPopulation(episodes, commits.length, wholeWindow),
      inContact: starvationPopulation(
        episodes.filter((episode) => episode.population === 'inContact'),
        commits.length,
        pacing
      ),
      betweenStrokes: starvationPopulation(
        episodes.filter((episode) => episode.population === 'betweenStrokes'),
        commits.length,
        betweenStrokes
      ),
      episodes,
    },
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
      movesPerSecond: contactSeconds ? round(canvasMoves.length / contactSeconds) : 0,
      // Absent in captures taken before the probe recorded it.
      kinds: [
        ...new Set(
          canvasMoves.map((event) => POINTER_KIND_NAMES[event[EVENT_KIND]]).filter(Boolean)
        ),
      ].join('+'),
      coalescedPerMove: canvasMoves.length
        ? round(sum(canvasMoves.map((event) => event[EVENT_COALESCED])) / canvasMoves.length)
        : 0,
      coalescedSpanMs: {
        p50: percentile(coalescedSpans, 0.5),
        p95: percentile(coalescedSpans, 0.95),
        max: max(coalescedSpans),
      },
      trust: {
        trusted: trustedMoves,
        untrusted: untrustedMoves,
        unknown: unknownTrustMoves,
        share:
          trustedMoves + untrustedMoves
            ? round(trustedMoves / (trustedMoves + untrustedMoves), 4)
            : undefined,
      },
      pressure: {
        p50: percentile(pressure, 0.5),
        p95: percentile(pressure, 0.95),
        max: max(pressure),
      },
      contactWidth: {
        p50: percentile(widths, 0.5),
        p95: percentile(widths, 0.95),
        max: max(widths),
      },
      contactHeight: {
        p50: percentile(heights, 0.5),
        p95: percentile(heights, 0.95),
        max: max(heights),
      },
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
      stalledLifts: hitches.filter((hitch) => hitch > STALL_FRAME_MS).length,
      measuredLifts: hitches.length,
      notableLifts,
      liftMs: {
        p50: percentile(hitches, 0.5),
        p95: percentile(hitches, 0.95),
        max: max(hitches),
      },
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

// Splits a phase into wall-clock buckets and paces each one. Two things need
// this. A hand-drawn phase cannot be compared to another hand-drawn phase — the
// operator draws differently each time — but it can be compared to ITSELF
// earlier, which is the "worse the more ink is on the page" claim stated as a
// measurement. And a phase's single p95 hides an onset: 15 s that are clean for
// 10 and fall apart for 5 read as mildly late.
function bucketPhase(phase, { frames, intervalMs }, bucketSeconds = 5) {
  const from = phase.startedAt;
  if (from === null || from === undefined) return [];
  const to = phase.endedAt ?? Infinity;
  const bucketMs = bucketSeconds * 1000;
  const buckets = new Map();
  for (let i = 1; i < frames.length; i++) {
    const time = frames[i][FRAME_T];
    if (time < from || time > to) continue;
    const delta = frames[i][FRAME_DT];
    if (delta < 0 || !frames[i][FRAME_CONTACT] || !frames[i - 1][FRAME_CONTACT]) continue;
    const bucket = Math.floor((time - from) / bucketMs);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(delta);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, deltas]) => ({
      phase: phase.key,
      'from s': bucket * bucketSeconds,
      ...frameStats(deltas, intervalMs),
    }));
}

export function bucketRows(report, bucketSeconds = 5) {
  const frames = report.frames ?? [];
  const tables = { frames, intervalMs: observedFrameIntervalMs(frames) };
  return (report.phases ?? []).flatMap((phase) => bucketPhase(phase, tables, bucketSeconds));
}

// A phase key may repeat — an A/B/A/B plan is how a hand-drawn comparison
// survives an operator who draws differently every time — so each repeat is
// labelled rather than silently shadowing the first.
function labelPhases(phases) {
  const seen = new Map();
  return phases.map((phase) => {
    const count = (seen.get(phase.key) ?? 0) + 1;
    seen.set(phase.key, count);
    return count === 1 ? phase : { ...phase, key: `${phase.key}#${count}` };
  });
}

// Returns `{ intervalMs, phases }` rather than the phase array with the beat
// riding on it as a property: `JSON.stringify` drops non-index properties of an
// array, so the derived beat — the number every `lateThresholdMs` hangs off, and
// the one an artifact exists to outlive its maths with — vanished from every
// saved `summaries`. The row builders below still take the phase array, so they
// stay pure and independently testable.
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
  return {
    intervalMs: tables.intervalMs,
    phases: labelPhases(phases).map((phase) => summarizePhase(phase, tables)),
  };
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
    // The two columns that stop a lift stall from hiding: everything in the
    // window, and everything that is not the stroke itself.
    'lost ms between': phase.betweenStrokes?.lostMs,
    'window max': phase.wholeWindow?.max,
    verdict: phase.verdict ?? phase.skipped,
  }));
}

export function inputRows(summaries) {
  return summaries.map((phase) => ({
    phase: phase.key,
    moves: phase.input?.moves,
    kind: phase.input?.kinds || undefined,
    'mv/frame': phase.input?.movesPerFrame,
    'mv/s': phase.input?.movesPerSecond,
    trusted: phase.input?.trust
      ? `${phase.input.trust.trusted}/${phase.input.trust.trusted + phase.input.trust.untrusted}` +
        (phase.input.trust.unknown ? ` (+${phase.input.trust.unknown} old)` : '')
      : undefined,
    'coal/mv': phase.input?.coalescedPerMove,
    'coal span p95': phase.input?.coalescedSpanMs?.p95,
    'pressure p50': phase.input?.pressure?.p50,
    'width p50': phase.input?.contactWidth?.p50,
    'height p50': phase.input?.contactHeight?.p50,
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
    'stalled lifts': phase.strokes
      ? `${phase.strokes.stalledLifts}/${phase.strokes.measuredLifts}`
      : undefined,
    'lift p95': phase.strokes?.liftMs?.p95,
    'lift max': phase.strokes?.liftMs?.max,
    'long dt 1st→3rd': phase.strokes?.longStrokeTrend
      ? `${phase.strokes.longStrokeTrend.firstThirdP50 ?? '–'}→${phase.strokes.longStrokeTrend.lastThirdP50 ?? '–'}`
      : undefined,
  }));
}

export function starvationRows(summaries) {
  return summaries.flatMap((phase) =>
    ['all', 'inContact', 'betweenStrokes'].map((population) => {
      const stats = phase.starvation?.[population];
      return {
        phase: phase.key,
        population,
        episodes: stats?.episodes,
        'episodes/commit': stats?.episodesPerCommit,
        'unexplained episode ms': stats?.starvationMs,
        'lost frame ms': stats?.lostFrameTimeMs,
        'lost frame %': Number.isFinite(stats?.lostFrameTimeShare)
          ? round(stats.lostFrameTimeShare * 100, 2)
          : undefined,
        'worst gap': stats?.worstFrameGapMs,
        'commits followed': stats
          ? `${stats.commitsFollowedByStarvation}/${stats.commits}`
          : undefined,
      };
    })
  );
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
      [`Δ paint p95 vs ${baselineKey}`]: delta(
        phase.paintLatencyMs.p95,
        baseline.paintLatencyMs.p95
      ),
      'Δ paint p99': delta(phase.paintLatencyMs.p99, baseline.paintLatencyMs.p99),
      'Δ dt p95': delta(phase.pacing.p95, baseline.pacing.p95),
      'Δ late %': round((phase.pacing.lateShare - baseline.pacing.lateShare) * 100, 1),
      'Δ lost ms': round(phase.pacing.lostMs - baseline.pacing.lostMs),
      'Δ stall %': round((phase.pacing.stallShare - baseline.pacing.stallShare) * 100, 1),
    }));
}
