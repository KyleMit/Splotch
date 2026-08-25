// Analyze a Safari Web Inspector *Timeline* export from a real iOS device.
//   node tools/perf/analyze-web-inspector.mjs <export.json>
//
// This is NOT the Chrome-trace format perf:analyze:chrome reads. Web Inspector exports
// {version, recording:{records, markers, samples}} and, critically:
//   - it records performance.mark() as `markers` ({time, type:'timestamp',
//     details:'engine.x:start'}) but does NOT export performance.measure(), so
//     engine.* durations aren't directly present;
//   - `markers` is a ring buffer — a long session keeps only the most recent
//     marks (detectable when the first marker ≫ recording.startTime);
//   - performance.now() is clamped to ~1 ms in WebKit, so sub-ms values are at or
//     below the clock floor — treat <1 ms as "effectively free," not precise.
//
// We recover an engine op's cost two ways:
//   1. Paired-mark duration for the legacy `engine.encode` and
//      `engine.reinflate` sub-slices, plus `engine.undo` when those marks
//      identify an archived snapshot/blob recording whose deep undo crossed
//      tasks while awaiting decode. Tiled history no longer emits those marks,
//      but retaining support keeps old exported recordings readable.
//   2. Enclosing record (every current op):
//      each synthetic pointer event is its own `event-dispatched` script
//      record, so the smallest record spanning the mark's timestamp bounds a
//      single-slice op's main-thread cost — unclamped, at full record
//      resolution, which a mark delta on these hottest sub-ms ops would lose.
// `engine.commit`, `engine.draw`, and `engine.scanEmpty` also emit a
// `finally`-closed `<name>:end` mark, so an early return (a buffered
// edge-swipe candidate in `draw`, the deferred-restore/no-op paths in
// `commitStrokeGroup`, a missing scratch context in `scanCanvasIsEmpty`)
// can't leave its `:start` unmatched in the marker stream — but since these
// three are synchronous and single-slice, their `:end` marks are used only
// to flag an unpaired start, never to compute the reported duration; the
// enclosing record stays their cost source.
// GPU-side cost shows up in paint/composite records instead (the canvas is
// GPU-accelerated, so issuing replay ops is cheap and rasterization is
// deferred off the main thread).

import { readFileSync } from 'node:fs';
import { fail } from '../lib/proc.mjs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node tools/perf/analyze-web-inspector.mjs <export.json>');
  process.exit(1);
}

let contents;
try {
  contents = readFileSync(path, 'utf8');
} catch {
  fail(`Web Inspector export not found or unreadable: ${path}`);
}
let parsed;
try {
  parsed = JSON.parse(contents);
} catch {
  fail(`Web Inspector export is not valid JSON: ${path}`);
}
const rec = parsed?.recording;
if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
  fail(`${path} is not a Web Inspector export (no .recording)`);
}
const markers = rec.markers || [];
const spans = (rec.records || [])
  .filter((r) => typeof r.startTime === 'number' && typeof r.endTime === 'number')
  .map((r) => ({
    type: r.type,
    ev: r.eventType,
    s: r.startTime,
    e: r.endTime,
    dur: (r.endTime - r.startTime) * 1000,
  }));

// Smallest record spanning t (so a commit paper copy maps to the pointerup record,
// not the whole-session frame). O(markers × spans) — fine for a single export.
const enclosing = (t) => {
  let best = null;
  for (const sp of spans) {
    if (sp.s <= t && t <= sp.e && (!best || sp.e - sp.s < best.e - best.s)) best = sp;
  }
  return best;
};

const stat = (v) => {
  v = v.slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, min: v[0], med: q(0.5), p90: q(0.9), max: v[v.length - 1] };
};
const fmt = (s) =>
  s
    ? `n=${s.n}  min=${s.min.toFixed(2)}  med=${s.med.toFixed(2)}  p90=${s.p90.toFixed(2)}  max=${s.max.toFixed(2)}`
    : 'none';

// Ops reporting paired-mark duration instead of the enclosing record's — see
// the header comment for why each needs it.
const hasLegacyHistoryMarks = markers.some(
  (marker) =>
    marker.details === 'engine.encode:start' || marker.details === 'engine.reinflate:start'
);
const PAIRED_DURATION_OPS = new Set([
  'engine.encode',
  'engine.reinflate',
  ...(hasLegacyHistoryMarks ? ['engine.undo'] : []),
]);

// Pairing each start with the first end before the next start is exact because
// every `:end`-emitting op is non-reentrant. A start whose end is missing is
// counted as unpaired rather than misattributed.
function engineOp(name) {
  const starts = markers.filter((m) => m.details === `${name}:start`).map((m) => m.time);
  const ends = markers.filter((m) => m.details === `${name}:end`).map((m) => m.time);
  let unpaired = 0;
  const durs = [];
  if (ends.length) {
    let j = 0;
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const nextStart = i + 1 < starts.length ? starts[i + 1] : Infinity;
      while (j < ends.length && ends[j] < s) j++;
      if (j < ends.length && ends[j] < nextStart) {
        durs.push((ends[j] - s) * 1000);
        j++;
      } else {
        unpaired++;
      }
    }
  }
  if (ends.length && PAIRED_DURATION_OPS.has(name)) {
    return { count: starts.length, task: stat(durs), source: 'paired marks', unpaired };
  }
  const tasks = starts.map((t) => enclosing(t)?.dur).filter((d) => d != null);
  return { count: starts.length, task: stat(tasks), source: 'enclosing record', unpaired };
}

console.log(`# Web Inspector timeline — ${path}\n`);
const winStart = rec.startTime,
  winEnd = rec.endTime;
console.log(`Recording window: ${(winEnd - winStart).toFixed(1)} s`);
if (markers.length) {
  const m0 = markers[0].time,
    mN = markers[markers.length - 1].time;
  const dropped = m0 - winStart > 2;
  console.log(
    `Marker span: ${m0.toFixed(1)} → ${mN.toFixed(1)} s (${(mN - m0).toFixed(1)} s)` +
      (dropped ? `  ⚠ ring buffer dropped the first ${(m0 - winStart).toFixed(0)} s of marks` : '')
  );
}
console.log('NOTE: WebKit clamps performance.now() to ~1 ms — treat <1 ms as effectively free.\n');

console.log('## Engine ops (ms — enclosing record unless the row says paired marks)\n');
for (const name of [
  'engine.undo',
  'engine.commit',
  'engine.resize',
  'engine.resize.tiles',
  'engine.resize.repaint',
  'engine.draw',
  'engine.scanEmpty',
  // Retained so archived recordings from the snapshot/blob renderer remain
  // analyzable.
  'engine.snapshot',
  'engine.fold',
  'engine.encode',
  'engine.reinflate',
]) {
  const op = engineOp(name);
  if (op.count)
    console.log(
      `${name.padEnd(20)} count=${String(op.count).padStart(5)}   ${fmt(op.task)}   [${op.source}]` +
        (op.unpaired ? `  ⚠ ${op.unpaired} start(s) without a matching end mark` : '')
    );
}

console.log('\n## GPU-side records (ms)\n');
console.log('paint     ', fmt(stat(spans.filter((s) => s.ev === 'paint').map((s) => s.dur))));
console.log('composite ', fmt(stat(spans.filter((s) => s.ev === 'composite').map((s) => s.dur))));

const frames = spans
  .filter((s) => s.type === 'timeline-record-type-rendering-frame')
  .map((s) => s.dur);
const active = frames.filter((d) => d < 1000); // drop idle-gap outliers
console.log('\n## Rendering frames (ms)\n');
console.log('active frames (excl >1 s idle gaps):', fmt(stat(active)));
console.log(
  `>8.3 ms (120Hz): ${active.filter((d) => d > 8.3).length}/${active.length}   >16.7 ms (60Hz): ${active.filter((d) => d > 16.7).length}/${active.length}`
);
console.log(
  '\n⚠ Frame durations are unreliable if the run used the synchronous console driver\n' +
    '  (it dispatches a whole stroke in one blocking tick). For a true per-frame/jank\n' +
    '  signal, pace input one op per rAF or hand-draw (Approach B in docs/PROFILING-IPAD.md).'
);
