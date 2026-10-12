// Recomputes the comment's per-run metrics and arm comparison from compact.json alone, with
// score.mjs's definitions (issue 2072 package at main 73b77dfb): overlapping-phase intervals,
// late = interval > 25 ms, excess = interval - tail cadence, 33.5 ms action gate, exact
// permutation test on the difference of means, seeded bootstrap CI of the median difference.
// Adds the settle interior max (intervals wholly inside the settle phase). Intervals not listed
// in compact.json are <= 20 ms, so every max above 20 ms and every late interval is exact; each
// undo's window worst is exported directly.
//   node reproduce.mjs compact.json
import { readFileSync } from 'node:fs';
const runs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x) => Math.round(x * 10) / 10;
const over = (L, a, b) => L.filter(([t, g]) => t + g > a && t < b).map(([, g]) => g);
const rows = runs.map((r) => {
  const p = r.phases, L = r.longIntervals, c = r.tailCadenceMs;
  const late = (g) => g.filter((x) => x > 25).reduce((s, x) => s + x - c, 0);
  const mx = (g) => (g.length ? Math.max(...g) : '<=20');
  return {
    label: r.label, arm: r.label.split('-').at(-1),
    undoMax: mx(over(L, p.undoStart, p.undoEnd)),
    undoOverGate: r.undos.filter((u) => u[3] > 33.5).length,
    undo1Window: r.undos[0][3],
    settleMax: mx(over(L, p.presented, p.undoStart)),
    settleInteriorMax: mx(L.filter(([t, g]) => t >= p.presented && t + g <= p.undoStart).map(([, g]) => g)),
    settleExcess: r1(late(over(L, p.presented, p.undoStart))),
    drawExcess: r1(late(over(L, 0, p.drawEnd))),
    sessionExcess: r1(late(over(L, 0, p.end))),
    commitP95: r.commitP95Ms, foldMax: Math.max(...r.folds.map(([, d]) => d)), folds: r.folds.length,
    undoJsSum: r1(r.undoJsMs.reduce((a, b) => a + b, 0)),
    ok: r.strokes === 30 && r.history.historyLength === 20 && r.history.snapshots === 20 && r.undos.length === 20,
    ink: r.ink, cadence: c,
  };
});
function perm(a, b) {
  const all = [...a, ...b], n = a.length, mean = (x) => x.reduce((s, y) => s + y, 0) / x.length;
  const obs = Math.abs(mean(a) - mean(b)); let ext = 0, tot = 0;
  const go = (st, pk) => { if (pk.length === n) { const A = pk.map((i) => all[i]), B = all.filter((_, i) => !pk.includes(i)); tot++; if (Math.abs(mean(A) - mean(B)) >= obs - 1e-9) ext++; return; } for (let i = st; i < all.length; i++) go(i + 1, [...pk, i]); };
  go(0, []); return ext / tot;
}
function boot(c, t) {
  let seed = 0x2072; const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pick = (xs) => Array.from(xs, () => xs[Math.floor(rand() * xs.length)]);
  const d = Array.from({ length: 20000 }, () => median(pick(t)) - median(pick(c))).sort((x, y) => x - y);
  return [r1(d[500]), r1(d[19499])];
}
console.table(rows);
for (const k of ['undoMax', 'undoOverGate', 'settleMax', 'settleInteriorMax', 'settleExcess', 'drawExcess', 'sessionExcess', 'commitP95', 'foldMax', 'undoJsSum']) {
  const c = rows.filter((x) => x.arm === 'ctl').map((x) => x[k]), t = rows.filter((x) => x.arm === 'trt').map((x) => x[k]);
  console.log(`${k.padEnd(18)} ctl ${r1(median(c))} [${Math.min(...c)}–${Math.max(...c)}]  trt ${r1(median(t))} [${Math.min(...t)}–${Math.max(...t)}]  Δmed ${r1(median(t) - median(c))} CI95 ${boot(c, t).join('..')}  p=${perm(t, c).toFixed(4)}`);
}
