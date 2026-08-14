import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  runOneRep,
  summarizeReport,
  summarizeSweep,
  sweepSummaryMarkdown,
  tallyFailures,
} from '../run-worker-sweep.mjs';

// tools/e2e-tuning/run-worker-sweep.mjs is the harness behind ADR-0078's worker count, driven
// locally and by .github/workflows/worker-sweep.yml. Playwright boots the
// preview servers (one fresh server per rep, env declared by
// commonWebServer.env), so what the sweep owns — the up-front build, the
// prebuilt handshake with the config, and the report accounting — is what gets
// checked here.

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('prebuilt handshake', () => {
  // The sweep builds once and tells playwright.config.ts to serve that bundle
  // preview-only through SPLOTCH_E2E_PREBUILT. The sweep is plain Node and the
  // config is TS reaching the specs' helpers through extensionless imports, so
  // the name cannot be one imported constant — the pattern in CLAUDE.md,
  // "Cross-file agreement is never maintained by prose". If either side drops
  // or renames the variable, every rep silently pays a rebuild again.
  it('names the same env var in the sweep and the Playwright config', () => {
    const sweep = readFileSync(
      join(REPO_ROOT, 'tools', 'e2e-tuning', 'run-worker-sweep.mjs'),
      'utf8'
    );
    const config = readFileSync(join(REPO_ROOT, 'web', 'playwright.config.ts'), 'utf8');
    expect(sweep).toContain("SPLOTCH_E2E_PREBUILT: 'true'");
    expect(config).toContain('process.env.SPLOTCH_E2E_PREBUILT');
  });
});

describe('sweep workflow', () => {
  const workflow = readFileSync(
    join(REPO_ROOT, '.github', 'workflows', 'worker-sweep.yml'),
    'utf8'
  );

  // The workflow's job is to supply hardware; the measurement protocol — the
  // build, the rep loop, the servers — belongs to the driver, where the local
  // half runs it too. Any of those reappearing in YAML is the regression this
  // catches.
  it('delegates the whole measurement to the driver', () => {
    expect(workflow).toMatch(/node tools\/e2e-tuning\/run-worker-sweep\.mjs/);
    expect(workflow).not.toMatch(/playwright test/);
    expect(workflow).not.toMatch(/vite preview/);
    expect(workflow).not.toMatch(/vite build/);
  });
});

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

describe('runOneRep', () => {
  const outDirs = [];
  const freshOutDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'worker-sweep-test-'));
    outDirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of outDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  // A reusable --out means a rep's report path can hold a report from a
  // previous sweep. A child that dies before writing one (a config-load error,
  // say) must not hand that stale file to the accounting as a fresh green rep —
  // the reproduced false-green from the PR #1052 review: pre-seed the report,
  // break the config, and the old code re-read the stale file as tests passing.
  it('cannot pass a failed child off a stale report', () => {
    const outDir = freshOutDir();
    writeFileSync(
      join(outDir, 'w1-rep1.json'),
      report([{ title: 'stale pass', status: 'passed', duration: 900 }])
    );
    const summary = runOneRep({ workers: 1, rep: 1, outDir }, () => {});
    expect(summary).toMatchObject({ w: 1, rep: 1, error: 'playwright wrote no JSON report' });
  });

  it('accepts the report its own child wrote', () => {
    const outDir = freshOutDir();
    const summary = runOneRep({ workers: 1, rep: 1, outDir }, ({ reportPath }) =>
      writeFileSync(reportPath, report([{ title: 'fresh pass', status: 'passed', duration: 900 }]))
    );
    expect(summary).toMatchObject({ tests: 1, failed: 0 });
  });
});

describe('summarizeReport', () => {
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

  // The aborted-run shape issue #1044 shipped: Playwright's webServer failed to
  // boot, the run executed nothing, and the JSON report still exists — empty
  // suites, ~25ms duration, the abort in top-level `errors`. That rep must come
  // back error-shaped (no `failed`) so summarizeSweep counts it red, carrying
  // the report's own first error line as its reason.
  it('reports a zero-execution run as the abort its report carries', () => {
    const summary = summarizeReport(
      JSON.stringify({
        stats: { duration: 25 },
        suites: [],
        errors: [
          { message: 'Error: http://localhost:4173 is already used\n    at Object.<anonymous>' },
        ],
      }),
      { workers: 4, rep: 1, jobSeconds: 3 }
    );
    expect(summary).toEqual({
      w: 4,
      rep: 1,
      jobSeconds: 3,
      error: 'Error: http://localhost:4173 is already used',
    });
  });

  // A skipped row means the test body never ran, so it can neither satisfy the
  // zero-execution guard (a skipped-only selection would keep test:sweep:smoke
  // green while executing nothing — PR #1052 review) nor count as a failure (a
  // deliberate conditional skip is not a flake).
  it('treats a skipped-only report as zero executions', () => {
    const summary = summarizeReport(report([{ title: 'skips', status: 'skipped', duration: 0 }]), {
      workers: 1,
      rep: 1,
      jobSeconds: 2,
    });
    expect(summary.error).toBe('report holds zero test executions');
  });

  it('counts a skip as neither an execution nor a failure', () => {
    const summary = summarizeReport(
      report([
        { title: 'runs', status: 'passed', duration: 100 },
        { title: 'skips', status: 'skipped', duration: 0 },
      ]),
      { workers: 1, rep: 1, jobSeconds: 30 }
    );
    expect(summary).toMatchObject({ tests: 1, failed: 0 });
    expect(summary.failures).toEqual([]);
  });

  it('reports a zero-execution run without recorded errors as itself', () => {
    const summary = summarizeReport(JSON.stringify({ stats: { duration: 25 }, suites: [] }), {
      workers: 2,
      rep: 2,
      jobSeconds: 1,
    });
    expect(summary.error).toBe('report holds zero test executions');
    expect(summary.failed).toBeUndefined();
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

  // A rep that never produced a report — or produced one holding zero
  // executions — has no `failed`; counting it as green would understate the
  // very rate the sweep exists to measure.
  it('counts a rep that never ran as red', () => {
    const total = summarizeSweep([{ w: 4, rep: 1, error: 'boom' }], { workers: 4, reps: 1 });
    expect(total).toMatchObject({ redRuns: 1, execs: 0, medianWallMs: null });
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
