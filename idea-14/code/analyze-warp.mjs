// Idea #14 analysis: rank pages by confident local warp and test the
// "big global nudge correlates with local warp" hypothesis.
// Run: node analyze-warp.mjs <warp-both.json>
import { readFileSync } from 'node:fs';

const results = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const GAIN_MIN = 1.15; // best offset must beat zero-offset by 15% to count as a real displacement

const BIG_NUDGE = new Set([
  'farm/pig-wide',
  'vehicles/excavator-wide',
  'dinosaur/stegosaurus-wide',
]);

for (const r of results) {
  const conf = r.tiles.filter((t) => t.gain >= GAIN_MIN);
  r.confMax = conf.length ? Math.max(...conf.map((t) => t.local)) : 0;
  r.confCount = conf.filter((t) => t.local >= 3).length;
  r.rawMax = r.localMax;
  const worstConf = conf.length ? conf.reduce((a, b) => (b.local > a.local ? b : a)) : null;
  r.worstConfTile = worstConf
    ? `(${worstConf.tx},${worstConf.ty}) d=(${worstConf.dx},${worstConf.dy}) gain ${worstConf.gain.toFixed(2)}`
    : '-';
}

for (const theme of ['night', 'light']) {
  const rows = results.filter((r) => r.theme === theme).sort((a, b) => b.confMax - a.confMax);
  console.log(
    `\n=== ${theme.toUpperCase()} — top 15 by confident local warp (gain>=${GAIN_MIN}) ===`
  );
  console.log(
    'page                          confMax  #tiles>=3px  rawMax  p90  global      worst confident tile'
  );
  for (const r of rows.slice(0, 15)) {
    console.log(
      `${r.page.padEnd(30)}${r.confMax.toFixed(1).padStart(7)}${String(r.confCount).padStart(9)}${r.rawMax.toFixed(1).padStart(11)}${r.localP90.toFixed(1).padStart(6)}  (${r.globalDx},${r.globalDy})`.padEnd(
        85
      ) + r.worstConfTile
    );
  }
  const marks = rows
    .map((r, i) =>
      BIG_NUDGE.has(r.page)
        ? `${r.page} rank ${i + 1}/${rows.length} confMax ${r.confMax.toFixed(1)} p90 ${r.localP90.toFixed(1)}`
        : null
    )
    .filter(Boolean);
  console.log(`\nbig-nudge pages in ${theme} ranking:`);
  for (const m of marks) console.log('  ' + m);

  const big = rows.filter((r) => BIG_NUDGE.has(r.page));
  const rest = rows.filter((r) => !BIG_NUDGE.has(r.page));
  const stats = (a, k) => {
    const v = a.map((r) => r[k]).sort((x, y) => x - y);
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    return { mean, median: v[(v.length / 2) | 0], max: v[v.length - 1] };
  };
  for (const k of ['confMax', 'localP90', 'localMedian']) {
    const b = stats(big, k);
    const o = stats(rest, k);
    console.log(
      `  ${k}: big-nudge mean ${b.mean.toFixed(2)} median ${b.median.toFixed(2)} | others mean ${o.mean.toFixed(2)} median ${o.median.toFixed(2)} max ${o.max.toFixed(2)}`
    );
  }
  // Mann-Whitney-ish: fraction of others the big-nudge pages beat on confMax
  const beats = big.map((r) => rest.filter((o) => r.confMax > o.confMax).length / rest.length);
  console.log(
    `  percentile of each big-nudge page's confMax among others: ${beats.map((b) => (b * 100).toFixed(0) + '%').join(', ')}`
  );
}

console.log('\n=== residual global shifts (post-align raws should be ~0) ===');
const shifted = results.filter((r) => Math.abs(r.globalDx) + Math.abs(r.globalDy) >= 2);
for (const r of shifted.sort(
  (a, b) => Math.hypot(b.globalDx, b.globalDy) - Math.hypot(a.globalDx, a.globalDy)
))
  console.log(`  ${r.page} ${r.theme}: (${r.globalDx},${r.globalDy})`);
console.log(`  ${shifted.length}/${results.length} raws with |residual| >= 2px`);
