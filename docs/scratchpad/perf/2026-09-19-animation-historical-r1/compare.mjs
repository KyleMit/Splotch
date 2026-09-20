// Prints the before/after comparison every README table is copied from, rescored from the packaged
// samples by the scorer at this checkout. Descriptive only: it attributes nothing.
//   node docs/scratchpad/perf/2026-09-19-animation-historical-r1/compare.mjs [--all]
import { SETS, armOf, readRun, rescore, scoredMaxima } from './lib.mjs';

const showAll = process.argv.includes('--all');
const round = (value) => (value === undefined || value === null ? 'n/a' : Math.round(value * 10) / 10);

for (const [directory, target, captures] of SETS) {
  const runs = captures.map((capture) => ({ capture, run: readRun(directory, target, capture) }));
  const labels = runs[0].run.actionPlan.applicableLabels;
  console.log(`\n## ${directory}/${target}`);
  for (const label of labels) {
    const cells = runs.map(({ capture, run }) => {
      const summary = rescore(run).find((entry) => entry.label === label);
      if (!summary) return { capture, text: 'absent', passed: null };
      return {
        capture,
        passed: summary.passed,
        text: `${summary.passed ? 'pass' : 'FAIL'} first ${round(summary.firstFrame?.p95)} post ${round(summary.frames?.p95)} max [${scoredMaxima(run, label).map(round).join(', ')}]`,
      };
    });
    const arms = new Set(cells.filter((cell) => cell.passed === false).map((cell) => armOf(cell.capture)));
    if (!showAll && arms.size === 0) continue;
    console.log(`${label}${arms.size ? `  (red in: ${[...arms].join(', ')})` : ''}`);
    for (const cell of cells) console.log(`  ${cell.capture.padEnd(9)} ${cell.text}`);
  }
}
