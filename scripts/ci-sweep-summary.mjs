// Companion to the manual-dispatch .github/workflows/worker-sweep.yml (ADR-0078).
// Collapses one Playwright JSON report into a single greppable line, so a sweep's
// worker-count numbers can be read straight out of the job log without
// downloading artifacts.
import { readFileSync } from 'node:fs';

const [reportPath, workers, rep, seconds] = process.argv.slice(2);

function flatten(suite, ancestry, out) {
  const titles = [...ancestry, suite.title].filter(Boolean);
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        out.push({
          file: spec.file,
          name: [...titles.slice(1), spec.title].join(' > '),
          status: result.status,
          duration: result.duration,
          retry: result.retry,
        });
      }
    }
  }
  for (const child of suite.suites ?? []) flatten(child, titles, out);
}

let summary;
try {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const results = [];
  for (const suite of report.suites) flatten(suite, [], results);
  const attempts = results.filter((r) => r.retry === 0);
  const failures = attempts.filter((r) => r.status !== 'passed');
  const passing = attempts.filter((r) => r.status === 'passed');

  summary = {
    w: Number(workers),
    rep: Number(rep),
    wallMs: Math.round(report.stats.duration),
    jobSeconds: Number(seconds),
    tests: attempts.length,
    failed: failures.length,
    // Total test time; grows with contention even though the work is identical,
    // which is what makes the contention tax visible.
    cpuMs: passing.reduce((a, r) => a + r.duration, 0),
    failures: failures.map((f) => ({ f: f.file, n: f.name, s: f.status, d: f.duration })),
  };
} catch (error) {
  summary = { w: Number(workers), rep: Number(rep), error: String(error.message ?? error) };
}

console.log('SWEEPRESULT ' + JSON.stringify(summary));
