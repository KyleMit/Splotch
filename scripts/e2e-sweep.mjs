// The E2E worker/flake sweep behind ADR-0078: run the suite N times at a given
// worker count and report, per rep, its wall clock and which tests failed.
//
// One driver for both callers — a local re-tune and
// .github/workflows/worker-sweep.yml — because the first version of this sweep
// lived as shell inside the workflow, and every defect it shipped with was a
// consequence of that: the server's env was hand-copied from
// playwright.shared.ts (and drifted), and neither the local nor the CI half could
// check the other.
//
// Three things this owns that a `playwright test` loop cannot:
//
// 1. **A fresh server per rep.** The suite leaves per-IP rate-limit windows full
//    — tests/generate-image.spec.ts deliberately exhausts the BYOK bucket, which
//    then takes RATE_LIMIT_WINDOW_MS to clear. Reps run back to back in about
//    that time, so a shared server hands the next rep a 429 where it expects a
//    415, and the sweep measures a flake it manufactured. Restarting clears the
//    in-memory limiter, and it also matches what CI actually does: one server,
//    one suite run.
// 2. **CI unset for the run.** `CI` turns on the two config branches that would
//    corrupt the measurement — `retries: 2` masks the very rate being measured,
//    and `reuseExistingServer: false` would make Playwright rebuild per rep.
// 3. **The server env declared, not inherited**, the same rule the other two
//    throwaway servers follow. See SWEEP_SERVER_ENV.
//
// `node scripts/e2e-sweep.mjs --workers=4 --reps=12 --out=/tmp/sweep`

import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { argFlag, fail, isMain, ROOT, runMain } from './lib/proc.mjs';
import { waitForUrl } from './lib/net.mjs';
import { freePort, spawnViteServer } from './lib/vite-server.mjs';

const PORT = 4173;
const SERVER_BOOT_BUDGET_MS = 60_000;

// A mirror of commonWebServer.env (web/playwright.shared.ts), which this file
// cannot import: that module reaches the specs' helpers through extensionless
// imports, which node --experimental-strip-types does not resolve.
// scripts/tests/worker-sweep.test.mjs compares the two objects key for key, so a
// name added there fails here rather than silently arriving from a developer's
// web/.env — which is the whole point of declaring it.
export const SWEEP_SERVER_ENV = {
  PUBLIC_ENABLE_DEV_HARNESS: 'true',
  ADMIN_ACCESS_TOKEN: 'test-admin-secret',
  ALLOWED_TOKENS_LIST: 'daycare-club,e2e-harness-probe',
  GEMINI_API_KEY: 'not-a-usable-gemini-key',
  GITHUB_ISSUE_TOKEN: '',
  GITHUB_ISSUE_REPO: 'splotch-tests/nowhere',
};

/** Every test execution in a Playwright JSON report, flattened. */
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

/**
 * Collapse one report into a single greppable line, so a sweep's numbers can be
 * read out of a job log without downloading artifacts.
 */
export function summarizeReport(reportJson, { workers, rep, jobSeconds }) {
  try {
    const report = JSON.parse(reportJson);
    const results = [];
    for (const suite of report.suites) flatten(suite, [], results);
    const attempts = results.filter((r) => r.retry === 0);
    const failures = attempts.filter((r) => r.status !== 'passed');

    return {
      w: workers,
      rep,
      wallMs: Math.round(report.stats.duration),
      jobSeconds,
      tests: attempts.length,
      failed: failures.length,
      // Total test time. It grows with contention even though the work is
      // identical, which is what makes the contention tax visible.
      cpuMs: attempts
        .filter((r) => r.status === 'passed')
        .reduce((total, r) => total + r.duration, 0),
      failures: failures.map((f) => ({ f: f.file, n: f.name, s: f.status, d: f.duration })),
    };
  } catch (error) {
    return { w: workers, rep, error: String(error.message ?? error) };
  }
}

/** The suite's own environment, minus the two vars that would reconfigure it. */
function runnerEnv(reportPath) {
  const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath };
  // Deleted rather than blanked: playwright.config.ts reads both for
  // truthiness, and `env -u` is what its comments describe.
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  return env;
}

async function runOneRep({ workers, rep, outDir }) {
  freePort(PORT);
  const { stop } = spawnViteServer(PORT, { env: SWEEP_SERVER_ENV, command: 'preview' });
  const reportPath = join(outDir, `w${workers}-rep${rep}.json`);
  const startedAt = Date.now();
  try {
    await waitForUrl(`http://localhost:${PORT}/`, SERVER_BOOT_BUDGET_MS);
    spawnSync(
      process.execPath,
      [
        join(ROOT, 'scripts', 'web.mjs'),
        'playwright',
        'test',
        `--workers=${workers}`,
        '--reporter=json',
      ],
      { cwd: ROOT, env: runnerEnv(reportPath), stdio: ['ignore', 'ignore', 'inherit'] }
    );
    return summarizeReport(readFileSync(reportPath, 'utf8'), {
      workers,
      rep,
      jobSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  } finally {
    stop();
  }
}

export async function runSweep({ workers, reps, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const summaries = [];
  for (let rep = 1; rep <= reps; rep++) {
    const summary = await runOneRep({ workers, rep, outDir });
    summaries.push(summary);
    console.log('SWEEPRESULT ' + JSON.stringify(summary));
  }
  const failed = summaries.reduce((total, s) => total + (s.failed ?? 0), 0);
  const red = summaries.filter((s) => (s.failed ?? 1) > 0).length;
  console.log(`SWEEPTOTAL w=${workers} reps=${reps} redRuns=${red} failures=${failed}`);
  return summaries;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const workers = Number(argFlag('workers'));
    const reps = Number(argFlag('reps', '5'));
    const outDir = argFlag('out', join(ROOT, 'sweep-runs'));
    if (!Number.isInteger(workers) || workers < 1) fail('--workers=<positive integer> is required');
    if (!Number.isInteger(reps) || reps < 1) fail('--reps must be a positive integer');
    await runSweep({ workers, reps, outDir });
  });
}
