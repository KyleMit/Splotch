import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SWEEP_SERVER_ENV,
  summarizeReport,
  summarizeSweep,
  sweepSummaryMarkdown,
  tallyFailures,
} from '../e2e-sweep.mjs';
import { commonWebServer } from '../../../web/playwright.shared.ts';

// tools/e2e-tuning/e2e-sweep.mjs is the harness behind ADR-0078's worker count, driven
// locally and by .github/workflows/worker-sweep.yml. It boots its own preview
// server, which puts it outside everything playwright.config.ts arranges — and
// every defect the first version shipped with was a consequence of re-doing that
// setup by hand. So the parts that can be checked, are.

describe('sweep server env', () => {
  // The sweep cannot import commonWebServer.env: that module reaches the specs'
  // helpers through extensionless imports, which node --experimental-strip-types
  // does not resolve. So it declares a mirror, and this is what holds the mirror
  // to it — the pattern in CLAUDE.md, "Cross-file agreement is never maintained
  // by prose". Adding a private env var goes red here rather than silently
  // letting a developer's web/.env supply it during a measurement.
  it('declares exactly what the Playwright web server declares', () => {
    expect(SWEEP_SERVER_ENV).toEqual(commonWebServer.env);
  });
});

describe('sweep workflow', () => {
  const workflow = readFileSync(
    join(import.meta.dirname, '..', '..', '.github', 'workflows', 'worker-sweep.yml'),
    'utf8'
  );

  // The workflow's job is to supply hardware and a build; the measurement
  // protocol belongs to the driver, where the local half runs it too. A rep loop
  // reappearing in YAML is the regression this catches.
  it('delegates the whole rep loop to the driver', () => {
    expect(workflow).toMatch(/node scripts\/e2e-sweep\.mjs/);
    expect(workflow).not.toMatch(/playwright test/);
    expect(workflow).not.toMatch(/vite preview/);
  });
});

describe('summarizeReport', () => {
  /** A Playwright JSON report with one suite of one spec per given result. */
  const report = (results) =>
    JSON.stringify({
      stats: { duration: 61_800 },
      suites: [
        {
          title: 'chromium',
          suites: [
            {
              title: 'flows.spec.ts',
              specs: results.map(({ title, status, duration, retry = 0 }) => ({
                file: 'flows.spec.ts',
                title,
                tests: [{ results: [{ status, duration, retry }] }],
              })),
            },
          ],
        },
      ],
    });

  it('counts first attempts and names what failed', () => {
    const summary = summarizeReport(
      report([
        { title: 'passes', status: 'passed', duration: 900 },
        { title: 'breaks', status: 'failed', duration: 14 },
      ]),
      { workers: 4, rep: 3, jobSeconds: 63 }
    );
    expect(summary).toMatchObject({ w: 4, rep: 3, wallMs: 61_800, tests: 2, failed: 1 });
    expect(summary.failures).toEqual([
      { f: 'flows.spec.ts', n: 'flows.spec.ts > breaks', s: 'failed', d: 14 },
    ]);
  });

  // Retries are off for a sweep, so a retry row means the measurement was run
  // misconfigured; counting it would inflate the execution count it divides by.
  it('ignores retry attempts', () => {
    const summary = summarizeReport(
      report([
        { title: 'flaky', status: 'failed', duration: 10, retry: 0 },
        { title: 'flaky', status: 'passed', duration: 20, retry: 1 },
      ]),
      { workers: 1, rep: 1, jobSeconds: 9 }
    );
    expect(summary).toMatchObject({ tests: 1, failed: 1 });
  });

  // cpuMs is the contention tax made visible, so it must sum passing work only —
  // a test that failed fast would otherwise pull the number down.
  it('sums passing durations only', () => {
    const summary = summarizeReport(
      report([
        { title: 'a', status: 'passed', duration: 100 },
        { title: 'b', status: 'passed', duration: 250 },
        { title: 'c', status: 'failed', duration: 9000 },
      ]),
      { workers: 2, rep: 1, jobSeconds: 70 }
    );
    expect(summary.cpuMs).toBe(350);
  });

  it('reports an unreadable report as itself', () => {
    expect(summarizeReport('not json', { workers: 4, rep: 1, jobSeconds: 1 }).error).toBeTruthy();
  });
});

describe('tallyFailures', () => {
  const rep = (...names) => ({ failures: names.map((n) => ({ n })) });

  it('ranks tests by how many reps they failed in', () => {
    expect(
      tallyFailures([rep('slow save'), rep('slow save', 'reveal'), rep('slow save'), rep()])
    ).toEqual([
      ['slow save', 3],
      ['reveal', 1],
    ]);
  });

  // Two failures of one test inside one rep is one flaky test, not two — the
  // distinction is the whole reason to count reps rather than executions.
  it('counts a test once per rep however often it failed in it', () => {
    expect(tallyFailures([rep('burst', 'burst')])).toEqual([['burst', 1]]);
  });

  it('has nothing to say about a clean sweep', () => {
    expect(tallyFailures([rep(), rep()])).toEqual([]);
  });
});

describe('summarizeSweep', () => {
  const rep = (wallMs, failed, ...names) => ({
    wallMs,
    tests: 204,
    failed,
    failures: names.map((n) => ({ n })),
  });

  it('reports the rates a retry count is chosen against', () => {
    expect(
      summarizeSweep([rep(60_000, 1, 'burst'), rep(70_000, 0), rep(65_000, 2, 'burst', 'reveal')], {
        workers: 4,
        reps: 3,
      })
    ).toEqual({
      w: 4,
      reps: 3,
      redRuns: 2,
      failures: 3,
      execs: 612,
      medianWallMs: 65_000,
      byTest: { burst: '2/3', reveal: '1/3' },
    });
  });

  // A rep that never produced a report has no `failed` — counting it as green
  // would understate the very rate the sweep exists to measure.
  it('counts a rep that produced no report as red', () => {
    const total = summarizeSweep([{ w: 4, rep: 1, error: 'boom' }], { workers: 4, reps: 1 });
    expect(total).toMatchObject({ redRuns: 1, medianWallMs: null });
  });

  it('renders a step summary that names the specs', () => {
    const markdown = sweepSummaryMarkdown(
      summarizeSweep([rep(60_000, 1, 'burst')], { workers: 8, reps: 1 })
    );
    expect(markdown).toContain('### 8 workers — 1/1 runs went red');
    expect(markdown).toContain('| burst | 1/1 |');
    expect(markdown).toContain('median wall 60.0s');
  });

  it('says so plainly when a sweep was clean', () => {
    expect(
      sweepSummaryMarkdown(summarizeSweep([rep(60_000, 0)], { workers: 2, reps: 1 }))
    ).toContain('No failures.');
  });
});
