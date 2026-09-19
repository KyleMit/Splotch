// Sanitized compact export of the scored runs for the issue comment: phase boundaries, the tail
// cadence, frame counts per phase, and every rAF interval over 20 ms with its start time (ms from
// the session's t0); every interval not listed is <= 20 ms. Each undo also carries its window's
// worst interval, so windows whose worst is <= 20 ms stay exact. No LAN address, device id, or host detail.
//   node export-compact.mjs <run.json>... > compact.json
import { readFileSync } from 'node:fs';
const LONG_MS = 20;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const out = process.argv.slice(2).map((f) => {
  const run = JSON.parse(readFileSync(f, 'utf8'));
  const r = run.result;
  const s = r.stamps;
  const p = r.phases;
  const iv = [];
  for (let i = 1; i < s.length; i++) iv.push([s[i - 1], +(s[i] - s[i - 1]).toFixed(2)]);
  const tail = iv.filter(([a], i) => s[i + 1] > p.undoEnd && a < p.end).map(([, g]) => g);
  const m = (n) => r.measures.filter(([x]) => x === n);
  const commits = m('engine.commit').map(([, , d]) => d).sort((a, b) => a - b);
  return {
    label: run.label, entry: r.entry, ua: r.ua, viewport: r.viewport, refreshHzBeforeRun: run.device.refreshHz,
    phases: p, stampsFirst: s[0], stampsLast: s.at(-1), intervalCount: iv.length, tailCadenceMs: median(tail),
    longIntervals: iv.filter(([, g]) => g > LONG_MS),
    undos: r.undos.map((u) => [u.at, u.windowEnd, u.toFrameMs, +Math.max(...iv.filter(([a], i) => s[i + 1] > u.at && a < u.windowEnd).map(([, g]) => g)).toFixed(2)]),
    strokes: r.strokeWindows.length, history: r.historyBeforeUndo, ink: r.nonTransparentAfterUndo,
    folds: m('engine.fold').map(([, t, d]) => [t, d]),
    commitCount: commits.length, commitP95Ms: commits[Math.ceil(commits.length * 0.95) - 1],
    undoJsMs: m('engine.undo').map(([, , d]) => d),
  };
});
console.log(JSON.stringify(out));
