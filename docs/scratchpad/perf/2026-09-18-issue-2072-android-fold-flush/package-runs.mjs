// Copies captured run files into runs/<set>/, dropping the LAN harness URL,
// collapsing the per-op engine.draw and engine.undoPatchCapture rows into
// totals, and storing frame stamps as 0.1 ms integer deltas (stampsDeciDelta:
// the first stamp, then each interval; score.mjs decodes them). Nothing scored reads the rows
// it drops. node package-runs.mjs <capture-root> <set>...
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COLLAPSED = new Set(['engine.draw', 'engine.undoPatchCapture']);
const [root, ...sets] = process.argv.slice(2);
const here = new URL('.', import.meta.url).pathname;
for (const set of sets) {
  mkdirSync(join(here, 'runs', set), { recursive: true });
  for (const file of readdirSync(join(root, set)).filter((f) => f.endsWith('.json') && !f.includes('trace'))) {
    const run = JSON.parse(readFileSync(join(root, set, file), 'utf8'));
    const r = run.result;
    const collapsed = {};
    for (const [name, , duration] of r.measures.filter(([n]) => COLLAPSED.has(n))) {
      const total = (collapsed[name] ??= { n: 0, totalMs: 0, maxMs: 0 });
      total.n++;
      total.totalMs = Math.round((total.totalMs + duration) * 100) / 100;
      total.maxMs = Math.max(total.maxMs, duration);
    }
    const out = {
      label: run.label,
      capturedAt: run.host.at,
      result: {
        ...r,
        measures: r.measures.filter(([n]) => !COLLAPSED.has(n)),
        collapsedMeasures: collapsed,
        stamps: undefined,
        stampsDeciDelta: r.stamps.map((t) => Math.round(t * 10)).map((t, i, all) => (i ? t - all[i - 1] : t)),
      },
    };
    writeFileSync(join(here, 'runs', set, file), JSON.stringify(out) + '\n');
  }
}
