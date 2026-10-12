// Cadence-explicit companion to score.mjs (issue 2072, 120 Hz confirmation).
// Per run: median rAF interval per phase, the tail cadence, primary maxima in
// beats, a two-beat-sensitive excess (sum of interval - cadence over intervals
// > 1.5 x cadence), undo 1's window and toFrameMs, and validity against PLAN.md.
//   node phase-cadence.mjs <dir>... [--json=<out>]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CADENCE_BAND_MS = [16.2, 17.2]; // PLAN.md Amendment B: Chrome no-touch rAF
const SENSITIVITY_BEATS = 1.5;
const SETTLE_CAP_MS = 180000; // session-payload.js's settle cap
const args = process.argv.slice(2);
const jsonOut = args.find((a) => a.startsWith("--json="))?.slice(7);
const files = args
  .filter((a) => !a.startsWith("--"))
  .flatMap((p) =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .map((f) => join(p, f))
      : [p],
  );

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const decodeStamps = (deltas) => {
  let t = 0;
  return deltas.map((d) => (t += d) / 10);
};
// Same interval selection as score.mjs.
function intervals(stamps, from, to) {
  const out = [];
  for (let i = 1; i < stamps.length; i++)
    if (stamps[i] > from && stamps[i - 1] < to)
      out.push(stamps[i] - stamps[i - 1]);
  return out;
}

function analyse(file) {
  const run = JSON.parse(readFileSync(file, "utf8"));
  const r = run.result;
  if (r.error) return { label: run.label, error: r.error };
  const p = r.phases;
  const s = r.stamps ?? decodeStamps(r.stampsDeciDelta);
  const cadence = median(intervals(s, p.undoEnd, p.end));
  const inBand = (x) => x >= CADENCE_BAND_MS[0] && x <= CADENCE_BAND_MS[1];
  const phaseOf = (a, b) => {
    const g = intervals(s, a, b);
    const max = Math.max(...g);
    return {
      medianMs: r2(median(g)),
      maxMs: r1(max),
      maxBeats: r2(max / cadence),
      excessOver1p5BeatMs: r1(
        g
          .filter((x) => x > SENSITIVITY_BEATS * cadence)
          .reduce((acc, x) => acc + x - cadence, 0),
      ),
      over1p5Beat: g.filter((x) => x > SENSITIVITY_BEATS * cadence).length,
      frames: g.length,
    };
  };
  const phases = {
    draw: phaseOf(0, p.drawEnd),
    settle: phaseOf(p.presented, p.undoStart),
    undo: phaseOf(p.undoStart, p.undoEnd),
    tail: phaseOf(p.undoEnd, p.end),
  };
  // Settle interior: only intervals wholly inside [presented, undoStart], so an
  // interval crossing into the undo phase is not charged to the idle folds.
  const interior = [];
  let boundaryIntoUndoMs = null;
  let worstInterior = { gap: -1, at: null };
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1],
      b = s[i];
    if (a >= p.presented && b <= p.undoStart) {
      interior.push(b - a);
      if (b - a > worstInterior.gap) worstInterior = { gap: b - a, at: a };
    }
    if (a < p.undoStart && b > p.undoStart) boundaryIntoUndoMs = r1(b - a);
  }
  const folds = r.measures.filter(([n]) => n === "engine.fold");
  const foldsBeforeUndo = folds.filter(([, t]) => t < p.undoStart).length;
  const nearestFold = folds.reduce(
    (best, [, t, d]) =>
      best === null ||
      Math.abs(t - worstInterior.at) < Math.abs(best.t - worstInterior.at)
        ? { t, d }
        : best,
    null,
  );
  const settleInterior = {
    maxMs: Math.max(...interior),
    maxBeats: r2(Math.max(...interior) / cadence),
    worstStartsAfterFoldStartMs: nearestFold
      ? r1(worstInterior.at - nearestFold.t)
      : null,
    nearestFoldDurationMs: nearestFold?.d ?? null,
    boundaryIntoUndoMs,
  };
  const u1 = r.undos[0];
  const tailCadenceInBand = inBand(cadence);
  return {
    label: run.label,
    arm: run.label.split("-").at(-1),
    refreshHzBeforeRun: run.device?.refreshHz ?? null,
    entry: r.entry,
    ua: r.ua,
    viewport: `${r.viewport.W}x${r.viewport.H}@${r.viewport.dpr} ${r.viewport.orientation}`,
    cadenceMs: r2(cadence),
    cadenceUnroundedMs: cadence,
    tailCadenceInBand,
    phaseMediansInBand: Object.fromEntries(
      ["draw", "settle", "undo"].map((k) => [k, inBand(phases[k].medianMs)]),
    ),
    phases,
    settleInterior,
    foldsBeforeUndo,
    settleExitedBeforeCap: p.settled - p.presented < SETTLE_CAP_MS,
    undo1: {
      windowWorstMs: r1(Math.max(...intervals(s, u1.at, u1.windowEnd))),
      toFrameMs: u1.toFrameMs,
      callMs: u1.callMs,
    },
    wallFromInjectMs: run.host?.wallFromInjectMs,
    drawWallMs: r1(p.drawEnd),
    settleWallMs: r1(p.undoStart - p.presented),
  };
}

const rows = files.map(analyse);
for (const x of rows) {
  if (x.error) {
    console.log(x.label, "ERROR", x.error.slice(0, 120));
    continue;
  }
  const ph = x.phases;
  console.log(
    `${x.label.padEnd(10)} ${x.entry} hz=${x.refreshHzBeforeRun} ${x.viewport} cad=${x.cadenceMs} tailOk=${x.tailCadenceInBand} folds<undo=${x.foldsBeforeUndo} capOk=${x.settleExitedBeforeCap} | med draw ${ph.draw.medianMs} settle ${ph.settle.medianMs} undo ${ph.undo.medianMs} | undo max ${ph.undo.maxMs} (${ph.undo.maxBeats} beats) settle max ${ph.settle.maxMs} (${ph.settle.maxBeats}) interior ${r1(x.settleInterior.maxMs)} (+${x.settleInterior.worstStartsAfterFoldStartMs} after fold) boundary ${x.settleInterior.boundaryIntoUndoMs} | >1.5beat excess draw ${ph.draw.excessOver1p5BeatMs} settle ${ph.settle.excessOver1p5BeatMs} undo ${ph.undo.excessOver1p5BeatMs} | u1 win ${x.undo1.windowWorstMs} toFrame ${x.undo1.toFrameMs} | draw wall ${x.drawWallMs} settle wall ${x.settleWallMs}`,
  );
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1) + "\n");
