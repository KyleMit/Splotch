// Reduces run-session.mjs outputs to per-phase frame and engine figures.
//   node analyze.mjs <dir-or-file>... [--json=<out>]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ACTION_FRAME_MAX_GATE_MS = 33.5;
const args = process.argv.slice(2);
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
const files = args
  .filter((a) => !a.startsWith('--'))
  .flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => f.endsWith('.json'))
          .map((f) => join(p, f))
      : [p]
  );

const pct = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)];
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// An interval within half a refresh of the cadence is on time: stamps are
// quantized to about 1 ms, so a 120 Hz beat reads 8 or 9 ms.
const LATE_FRAME_TOLERANCE = 1.5;

// Every complete rAF-to-rAF interval that overlaps [from, to]. A window edge is
// never a frame edge: an interval that began before `from` (the frame an undo
// call lands in) counts whole, so synchronous work at the edge stays inside.
// Where the samples do not bracket the window (a capture that kept no stamp
// before its start or after its end), the window edge closes the interval and
// the result is flagged as a lower bound.
function framesIn(stamps, from, to, frameMs) {
  const edges = [...stamps];
  const openStart = !edges.length || edges[0] > from;
  const openEnd = !edges.length || edges[edges.length - 1] < to;
  if (openStart) edges.unshift(from);
  if (openEnd) edges.push(to);
  const gaps = [];
  for (let i = 1; i < edges.length; i++) {
    const start = edges[i - 1];
    const end = edges[i];
    if (end > from && start < to) gaps.push({ start, end, ms: end - start });
  }
  const worst = gaps.reduce((a, g) => (g.ms > a.ms ? g : a), { ms: 0 });
  const lowerBound = (openStart && worst.start === from) || (openEnd && worst.end === to);
  return {
    spanMs: to - from,
    maxGapMs: worst.ms,
    maxGapIsLowerBound: lowerBound,
    worst,
    over33: gaps.filter((g) => g.ms > ACTION_FRAME_MAX_GATE_MS).length,
    lateExcessMs: gaps.reduce(
      (a, g) => a + (g.ms > frameMs * LATE_FRAME_TOLERANCE ? g.ms - frameMs : 0),
      0
    ),
  };
}

function measuresIn(measures, from, to) {
  const out = {};
  for (const [name, start, dur] of measures) {
    if (start < from || start >= to) continue;
    const e = (out[name] ??= { n: 0, total: 0, max: 0, all: [] });
    e.n++;
    e.total += dur;
    e.max = Math.max(e.max, dur);
    e.all.push(dur);
  }
  return out;
}

function summarize(file) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const r = run.result;
  if (r.error) return { label: run.label, error: r.error };
  const p = r.phases;
  const m = r.measures;
  // The observed refresh interval: the median gap of the idle tail.
  const tail = r.stamps.filter((t) => t > p.undoEnd && t < p.end);
  const frameMs = pct(
    tail.slice(1).map((t, i) => t - tail[i]),
    0.5
  );
  const phaseBounds = {
    draw: [0, p.drawEnd],
    present: [p.drawEnd, p.presented],
    settle: [p.presented, p.undoStart],
    undo: [p.undoStart, p.undoEnd],
    tail: [p.undoEnd, p.end],
  };
  const phases = {};
  for (const [k, [a, b]] of Object.entries(phaseBounds)) {
    const f = framesIn(r.stamps, a, b, frameMs);
    const ms = measuresIn(m, a, b);
    const inWorst = m
      .filter(([, s, d]) => s < f.worst.end && s + d > f.worst.start)
      .map(([n, , d]) => `${n}:${r1(d)}`);
    phases[k] = {
      spanMs: r1(f.spanMs),
      maxGapMs: r1(f.maxGapMs),
      over33: f.over33,
      maxGapIsLowerBound: f.maxGapIsLowerBound,
      lateExcessMs: r1(f.lateExcessMs),
      worstFrameMeasures: inWorst.slice(0, 6),
      engine: Object.fromEntries(
        Object.entries(ms).map(([n, e]) => [
          n,
          { n: e.n, total: r1(e.total), max: r1(e.max), p95: r1(pct(e.all, 0.95)) },
        ])
      ),
    };
  }
  const commits = m.filter(([n]) => n === 'engine.commit').map(([, , d]) => d);
  const undoFrames = r.undos.map((u) => u.toFrameMs);
  const whole = framesIn(r.stamps, 0, p.end, frameMs);
  const undoWindows = r.undos.map(
    (u) => framesIn(r.stamps, u.at, u.windowEnd ?? u.at + u.toFrameMs, frameMs).maxGapMs
  );
  return {
    label: run.label,
    arm: r.arm,
    mode: r.mode,
    entry: r.entry,
    frameMs: r1(frameMs),
    viewport: `${r.viewport.W}x${r.viewport.H}@${r.viewport.dpr} ${r.viewport.orientation}`,
    ua: r.ua.match(/Version\/[\d.]+/)?.[0],
    drawMs: r1(p.drawEnd),
    drawToPresentMs: r1(p.presented),
    settleMs: r1(p.settled - p.presented),
    commitMaxMs: r1(Math.max(0, ...commits)),
    commitP95Ms: r1(pct(commits, 0.95)),
    undoSteps: r.undos.length,
    undoToFrameP95Ms: r1(pct(undoFrames, 0.95)),
    undoToFrameMaxMs: r1(Math.max(0, ...undoFrames)),
    brush: r.brush ?? 'crayon',
    ghost: r.ghost ?? 'on',
    undoGapMs: r.undoGapMs ?? 0,
    ghostsSeen: r.undos.filter((u) => u.ghosts > 0).length,
    undoWindowWorstMs: undoWindows.map(Math.round),
    undoWindowP50Ms: r1(pct(undoWindows, 0.5)),
    undoWindowMaxMs: r1(Math.max(0, ...undoWindows)),
    undoWindowsOver33: undoWindows.filter((g) => g > ACTION_FRAME_MAX_GATE_MS).length,
    undoCallMaxMs: r1(Math.max(0, ...r.undos.map((u) => u.callMs))),
    sessionMs: r1(p.end),
    sessionMaxGapMs: r1(whole.maxGapMs),
    sessionOver33: whole.over33,
    sessionMaxGapIsLowerBound: whole.maxGapIsLowerBound,
    sessionLateExcessMs: r1(whole.lateExcessMs),
    historyBeforeUndo: r.historyBeforeUndo,
    historyAfterUndo: r.historyAfterUndo,
    inkAfterUndo: r.nonTransparentAfterUndo,
    hostWallFromInjectMs: run.host.wallFromInjectMs,
    phases,
  };
}

const rows = files.map(summarize);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
for (const s of rows) {
  if (s.error) {
    console.log(s.label, 'ERROR', s.error.slice(0, 200));
    continue;
  }
  console.log(
    `${s.label.padEnd(26)} ${s.arm.padEnd(12)} ${s.brush}/ghost-${s.ghost}/gap${s.undoGapMs} ghosts=${s.ghostsSeen} undoWin p50/max=${s.undoWindowP50Ms}/${s.undoWindowMaxMs} >33=${s.undoWindowsOver33}/${s.undoSteps} ${s.mode} draw=${s.drawMs} present=${s.drawToPresentMs} commit p95/max=${s.commitP95Ms}/${s.commitMaxMs} undo p95/max=${s.undoToFrameP95Ms}/${s.undoToFrameMaxMs} (${s.undoSteps}) session=${s.sessionMs} maxGap=${s.sessionMaxGapMs} >33=${s.sessionOver33} lateExcess=${s.sessionLateExcessMs} ink=${s.inkAfterUndo}`
  );
  for (const [k, ph] of Object.entries(s.phases)) {
    const eng = Object.entries(ph.engine)
      .map(([n, e]) => `${n.replace('engine.', '')} ${e.n}×/${e.total}/max${e.max}`)
      .join(' · ');
    console.log(
      `   ${k.padEnd(8)} span=${ph.spanMs} maxGap=${ph.maxGapMs} >33=${ph.over33} lateExcess=${ph.lateExcessMs} [${ph.worstFrameMeasures.join(' ')}]  ${eng}`
    );
  }
}
