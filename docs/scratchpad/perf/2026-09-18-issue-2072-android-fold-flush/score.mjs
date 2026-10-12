// Scores run-session-android.mjs outputs by arm. One run is one experimental
// unit; frames inside a run are correlated and never pooled across runs.
//   node score.mjs <dir>... [--json=<out>]   (arm = label suffix after the last '-':
//   ctl is unchanged main, trt the treatment)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ACTION_FRAME_MAX_GATE_MS = 33.5;
const LATE_INTERVAL_MS = 25;
const BOOTSTRAP_RESAMPLES = 20000;
const args = process.argv.slice(2);
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
const files = args
  .filter((a) => !a.startsWith('--'))
  .flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => join(p, f)) : [p]));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x) => Math.round(x * 10) / 10;

function decodeStamps(deltas) {
  let t = 0;
  return deltas.map((d) => (t += d) / 10);
}

function intervals(stamps, from, to) {
  const out = [];
  for (let i = 1; i < stamps.length; i++) if (stamps[i] > from && stamps[i - 1] < to) out.push(stamps[i] - stamps[i - 1]);
  return out;
}

function lateExcess(gaps, cadence) {
  return gaps.filter((g) => g > LATE_INTERVAL_MS).reduce((a, g) => a + g - cadence, 0);
}

function scoreRun(file) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const r = run.result;
  if (r.error) return { label: run.label, error: r.error };
  const p = r.phases;
  const s = r.stamps ?? decodeStamps(r.stampsDeciDelta);
  const cadence = median(intervals(s, p.undoEnd, p.end));
  const phase = (a, b) => {
    const g = intervals(s, a, b);
    return { maxMs: r1(Math.max(...g)), over25: g.filter((x) => x > LATE_INTERVAL_MS).length, lateExcessMs: r1(lateExcess(g, cadence)) };
  };
  const undoWindows = r.undos.map((u) => Math.max(...intervals(s, u.at, u.windowEnd)));
  const m = (name) => r.measures.filter(([n]) => n === name).map(([, , d]) => d);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const commits = m('engine.commit').sort((a, b) => a - b);
  return {
    label: run.label,
    arm: run.label.split('-').at(-1),
    entry: r.entry,
    viewport: `${r.viewport.W}x${r.viewport.H}@${r.viewport.dpr} ${r.viewport.orientation}`,
    brush: r.brush,
    deposition: r.arm,
    cadenceMs: r1(cadence),
    strokes: r.strokeWindows.length,
    historyBeforeUndo: { historyLength: r.historyBeforeUndo.historyLength, snapshots: r.historyBeforeUndo.snapshots, baseRasters: r.historyBeforeUndo.baseRasters, rasterBytes: r.historyBeforeUndo.rasterBytes, baseRasterBytes: r.historyBeforeUndo.baseRasterBytes },
    undos: r.undos.length,
    inkAfterUndo: r.nonTransparentAfterUndo,
    undoPhaseMaxMs: phase(p.undoStart, p.undoEnd).maxMs,
    undoWindowsOverGate: undoWindows.filter((g) => g > ACTION_FRAME_MAX_GATE_MS).length,
    undoWindowWorstMs: undoWindows.map(Math.round),
    draw: phase(0, p.drawEnd),
    settle: phase(p.presented, p.undoStart),
    undo: phase(p.undoStart, p.undoEnd),
    sessionLateExcessMs: r1(lateExcess(intervals(s, 0, p.end), cadence)),
    commitP95Ms: r1(commits[Math.ceil(commits.length * 0.95) - 1] ?? 0),
    foldMaxMs: r1(Math.max(0, ...m('engine.fold'))),
    foldCount: m('engine.fold').length,
    undoJsMaxMs: r1(Math.max(0, ...m('engine.undo'))),
    undoJsSumMs: r1(sum(m('engine.undo'))),
    drawJsSumMs: r1(r.collapsedMeasures?.['engine.draw']?.totalMs ?? sum(m('engine.draw'))),
  };
}

// Exact two-sided permutation test on the difference of means.
function permutationP(a, b) {
  const all = [...a, ...b];
  const n = a.length;
  const observed = Math.abs(a.reduce((x, y) => x + y, 0) / n - b.reduce((x, y) => x + y, 0) / b.length);
  let extreme = 0;
  let total = 0;
  const choose = (start, picked) => {
    if (picked.length === n) {
      const inA = new Set(picked);
      const A = picked.map((i) => all[i]);
      const B = all.filter((_, i) => !inA.has(i));
      const d = Math.abs(A.reduce((x, y) => x + y, 0) / A.length - B.reduce((x, y) => x + y, 0) / B.length);
      total++;
      if (d >= observed - 1e-9) extreme++;
      return;
    }
    for (let i = start; i < all.length; i++) choose(i + 1, [...picked, i]);
  };
  choose(0, []);
  return { p: extreme / total, permutations: total };
}

// Seeded bootstrap of the difference in medians (treatment − control).
function bootstrapCi(control, treatment) {
  let seed = 0x2072;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pick = (xs) => Array.from(xs, () => xs[Math.floor(rand() * xs.length)]);
  const diffs = Array.from({ length: BOOTSTRAP_RESAMPLES }, () => median(pick(treatment)) - median(pick(control))).sort((x, y) => x - y);
  return [r1(diffs[Math.floor(0.025 * diffs.length)]), r1(diffs[Math.floor(0.975 * diffs.length) - 1])];
}

const rows = files.map(scoreRun);
const byArm = {};
for (const row of rows.filter((x) => !x.error)) (byArm[row.arm] ??= []).push(row);
const metrics = [
  ['undoPhaseMaxMs', (x) => x.undoPhaseMaxMs],
  ['undoWindowsOverGate', (x) => x.undoWindowsOverGate],
  ['undo.lateExcessMs', (x) => x.undo.lateExcessMs],
  ['settle.maxMs', (x) => x.settle.maxMs],
  ['settle.lateExcessMs', (x) => x.settle.lateExcessMs],
  ['draw.lateExcessMs', (x) => x.draw.lateExcessMs],
  ['sessionLateExcessMs', (x) => x.sessionLateExcessMs],
  ['commitP95Ms', (x) => x.commitP95Ms],
  ['foldMaxMs', (x) => x.foldMaxMs],
  ['undoJsSumMs', (x) => x.undoJsSumMs],
];
const comparison = {};
if (byArm.ctl && byArm.trt) {
  for (const [name, get] of metrics) {
    const c = byArm.ctl.map(get);
    const t = byArm.trt.map(get);
    comparison[name] = {
      control: { n: c.length, median: r1(median(c)), min: Math.min(...c), max: Math.max(...c) },
      treatment: { n: t.length, median: r1(median(t)), min: Math.min(...t), max: Math.max(...t) },
      medianDifference: r1(median(t) - median(c)),
      medianDifferenceCi95: bootstrapCi(c, t),
      permutation: permutationP(t, c),
    };
  }
}
for (const row of rows) {
  if (row.error) { console.log(row.label, 'ERROR', row.error.slice(0, 120)); continue; }
  console.log(`${row.label.padEnd(12)} ${row.entry} ${row.brush}/${row.deposition} strokes=${row.strokes} hist=${row.historyBeforeUndo.historyLength}/${row.historyBeforeUndo.snapshots} undos=${row.undos} ink=${row.inkAfterUndo} | undoMax=${row.undoPhaseMaxMs} >gate=${row.undoWindowsOverGate} | settle max=${row.settle.maxMs} excess=${row.settle.lateExcessMs} | draw excess=${row.draw.lateExcessMs} | session excess=${row.sessionLateExcessMs} | commit p95=${row.commitP95Ms} fold max=${row.foldMaxMs} undoJS sum=${row.undoJsSumMs}`);
}
for (const [name, c] of Object.entries(comparison)) console.log(`${name.padEnd(22)} ctl med ${c.control.median} [${c.control.min}–${c.control.max}]  trt med ${c.treatment.median} [${c.treatment.min}–${c.treatment.max}]  Δmed ${c.medianDifference} CI95 ${c.medianDifferenceCi95.join('..')}  p=${c.permutation.p.toFixed(4)} (${c.permutation.permutations})`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ runs: rows, comparison }, null, 1) + '\n');
