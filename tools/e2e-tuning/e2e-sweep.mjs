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
//    — tests/generate-image.spec.ts deliberately exhausts the BYOK bucket and
//    bursts the managed token's, each of which then takes the window in
//    lib/server/rateLimitPolicy.ts to clear. Reps run back to back in about that
//    time, so a shared server hands the next rep a 429 where it expects a 415,
//    and the sweep measures a flake it manufactured. Restarting clears the
//    in-memory limiter, and it also matches what CI actually does: one server,
//    one suite run.
// 2. **CI unset for the run.** `CI` turns on the two config branches that would
//    corrupt the measurement — `retries: 2` masks the very rate being measured,
//    and `reuseExistingServer: false` would make Playwright rebuild per rep.
// 3. **The server env declared, not inherited**, the same rule the other two
//    throwaway servers follow. See SWEEP_SERVER_ENV.
//
// `node tools/e2e-tuning/e2e-sweep.mjs --workers=4 --reps=12 --out=/tmp/sweep`

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { argFlag, fail, isMain, ROOT, runMain } from '../lib/proc.mjs';
import { waitForUrl } from '../lib/net.mjs';
import { freePort, spawnViteServer } from '../lib/vite-server.mjs';

const PORT = 4173;
const SERVER_BOOT_BUDGET_MS = 60_000;

// A mirror of commonWebServer.env (web/playwright.shared.ts), which this file
// cannot import: that module reaches the specs' helpers through extensionless
// imports, which node --experimental-strip-types does not resolve.
// tools/e2e-tuning/tests/worker-sweep.test.mjs compares the two objects key for key, so a
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
    // A server that never answers is one bad rep too, not just a report that
    // never got written — and on a 35-rep sweep a port still held by the previous
    // rep is a realistic way to get there. Letting it throw would lose SWEEPTOTAL
    // and the job summary for every rep already measured.
    await waitForUrl(`http://localhost:${PORT}/`, SERVER_BOOT_BUDGET_MS).catch((error) => {
      throw new Error(`preview server never came up: ${error.message ?? error}`);
    });
    spawnSync(
      process.execPath,
      [
        join(ROOT, 'tools', 'web.mjs'),
        'playwright',
        'test',
        `--workers=${workers}`,
        '--reporter=json',
      ],
      { cwd: ROOT, env: runnerEnv(reportPath), stdio: ['ignore', 'ignore', 'inherit'] }
    );
    const meta = { workers, rep, jobSeconds: Math.round((Date.now() - startedAt) / 1000) };
    // Whatever went wrong with a rep — no server, no report, a crash — it is one
    // bad rep, not a reason to abandon the other thirty. An unattended sweep has
    // to survive it and say so, and summarizeSweep counts a rep with no `failed`
    // as red, which is the right accounting for a rep that never ran.
    if (!existsSync(reportPath)) throw new Error('playwright wrote no JSON report');
    return summarizeReport(readFileSync(reportPath, 'utf8'), meta);
  } catch (error) {
    return { w: workers, rep, error: String(error.message ?? error) };
  } finally {
    stop();
  }
}

/**
 * How many reps each failing test accounted for, worst first. A sweep's answer is
 * rarely "the suite is N% flaky" — it is usually one or two specs carrying nearly
 * all of it, and that distinction is what decides whether to fix a spec or change
 * the retry count. Reported per test rather than per execution, so a spec that
 * fails twice in one rep can't look like two flaky specs.
 */
export function tallyFailures(summaries) {
  const reps = new Map();
  for (const summary of summaries) {
    for (const name of new Set((summary.failures ?? []).map((f) => f.n))) {
      reps.set(name, (reps.get(name) ?? 0) + 1);
    }
  }
  return [...reps].sort((a, b) => b[1] - a[1]);
}

export async function runSweep({ workers, reps, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const summaries = [];
  for (let rep = 1; rep <= reps; rep++) {
    const summary = await runOneRep({ workers, rep, outDir });
    summaries.push(summary);
    console.log('SWEEPRESULT ' + JSON.stringify(summary));
  }
  const total = summarizeSweep(summaries, { workers, reps });
  console.log(`SWEEPTOTAL ${JSON.stringify(total)}`);
  // A sweep's conclusion should not need log spelunking. On GitHub Actions the
  // step summary renders on the run page itself, where the whole matrix is one
  // screen instead of six job logs.
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, sweepSummaryMarkdown(total));
  }
  return summaries;
}

/** The whole sweep in one object: the rates, and which specs they belong to. */
export function summarizeSweep(summaries, { workers, reps }) {
  const wall = summaries.map((s) => s.wallMs).filter((ms) => typeof ms === 'number');
  wall.sort((a, b) => a - b);
  return {
    w: workers,
    reps,
    redRuns: summaries.filter((s) => (s.failed ?? 1) > 0).length,
    failures: summaries.reduce((sum, s) => sum + (s.failed ?? 0), 0),
    execs: summaries.reduce((sum, s) => sum + (s.tests ?? 0), 0),
    medianWallMs: wall.length ? wall[Math.floor(wall.length / 2)] : null,
    byTest: Object.fromEntries(tallyFailures(summaries).map(([name, n]) => [name, `${n}/${reps}`])),
  };
}

export function sweepSummaryMarkdown(total) {
  const rows = Object.entries(total.byTest)
    .map(([name, share]) => `| ${name} | ${share} |`)
    .join('\n');
  return [
    `### ${total.w} workers — ${total.redRuns}/${total.reps} runs went red`,
    '',
    `${total.failures} failing test executions of ${total.execs}; median wall ` +
      `${total.medianWallMs === null ? 'n/a' : (total.medianWallMs / 1000).toFixed(1) + 's'}. ` +
      'Retries are off, so these are the unretried rates.',
    '',
    ...(rows ? ['| Test | Reps it failed in |', '| --- | --- |', rows] : ['No failures.']),
    '',
  ].join('\n');
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
