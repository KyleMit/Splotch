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
// Playwright owns the servers: each rep is one `playwright test` invocation,
// and with server reuse disabled unconditionally (playwright.config.ts), every
// rep boots a fresh preview server whose env is declared by
// commonWebServer.env. Fresh matters — the suite leaves per-IP rate-limit
// windows full (tests/generate-image.spec.ts deliberately exhausts the BYOK
// bucket and bursts the managed token's), so a server shared across reps hands
// the next rep a 429 where it expects a 415 and the sweep measures a flake it
// manufactured. An earlier version of this sweep booted its own server for
// Playwright to reuse; when the config stopped reusing servers, that server
// collided with the config's webServer and every rep silently reported 0 tests
// as 0 failures (issue #1044). The three responsibilities below are what
// remain — and the zero-execution accounting exists so a regression of this
// kind can never read as green again.
//
// Three things this owns that a `playwright test` loop cannot:
//
// 1. **One build, shared by every rep.** The config's default webServer command
//    is `vite build && vite preview`, which would spend a full rebuild of an
//    identical bundle inside every rep. runSweep builds up front and sets
//    SPLOTCH_E2E_PREBUILT so each rep's webServer serves that bundle
//    preview-only — and because the sweep rebuilds every run, it cannot
//    measure a stale bundle. `--prebuilt` skips the build for a caller that
//    just produced one (the CI sweep smoke reuses the e2e shard's build).
// 2. **CI unset for the rep.** `CI` turns on the config branch that would
//    corrupt the measurement: `retries: 2` masks the very unretried rate being
//    measured. (It also selects the CI worker count, but `--workers` overrides
//    that either way.)
// 3. **Zero-execution accounting.** A rep whose report holds no test
//    executions is a red rep carrying the report's own error as its reason,
//    and a sweep in which no rep executed anything exits nonzero — "0
//    failures" must never mean "0 tests".
//
// `node tools/e2e-tuning/run-worker-sweep.mjs --workers=4 --reps=12 --out=/tmp/sweep`

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { argFlag, fail, isMain, ROOT, runMain } from '../lib/proc.mjs';

const RUN_WEB_TOOL = join(ROOT, 'tools', 'run-web-tool.mjs');

// PUBLIC_ENABLE_DEV_HARNESS must be set at BUILD time — vite.config.ts reads it
// to compile in the /dev/* harness routes the specs drive (they 404 otherwise),
// and every rep's preview server serves whatever this build baked in. The
// server-side credentials are runtime env and come from commonWebServer.env
// when Playwright boots each preview, so they are not needed here.
function buildPreviewBundle() {
  const build = spawnSync(process.execPath, [RUN_WEB_TOOL, 'vite', 'build'], {
    cwd: ROOT,
    env: { ...process.env, PUBLIC_ENABLE_DEV_HARNESS: 'true' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (build.status !== 0) fail('vite build failed — there is no bundle to measure');
}

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
    // A skipped row is not an execution: counting it would let a skipped-only
    // selection satisfy the zero-execution guard below with a test body that
    // never ran, and would read a deliberate conditional skip as a failure in
    // the flake tally.
    const attempts = results.filter((r) => r.retry === 0 && r.status !== 'skipped');
    // A report holding no executions is an aborted run, not a clean one — a
    // webServer that failed to boot leaves exactly this shape (empty `suites`,
    // ~25ms duration, the abort in top-level `errors`), and counting it as "0
    // failed" is how issue #1044's sweeps green-lit reps that never ran. Come
    // back error-shaped instead, so summarizeSweep counts the rep red.
    if (attempts.length === 0) {
      const abort = report.errors?.[0]?.message?.split('\n', 1)[0];
      return { w: workers, rep, jobSeconds, error: abort ?? 'report holds zero test executions' };
    }
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
  const env = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    // The sweep built once up front (buildPreviewBundle, or the --prebuilt
    // caller); this points each rep's webServer at that bundle preview-only.
    // Drift-guarded against playwright.config.ts by
    // tools/e2e-tuning/tests/worker-sweep.test.mjs — the config's TS module
    // graph is not importable from plain Node, so the name cannot be shared.
    SPLOTCH_E2E_PREBUILT: 'true',
  };
  // Deleted rather than blanked: playwright.config.ts reads both for
  // truthiness, and `env -u` is what its comments describe.
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  return env;
}

function spawnPlaywrightRep({ workers, grep, reportPath }) {
  spawnSync(
    process.execPath,
    [
      RUN_WEB_TOOL,
      'playwright',
      'test',
      `--workers=${workers}`,
      '--reporter=json',
      ...(grep ? [`--grep=${grep}`] : []),
    ],
    { cwd: ROOT, env: runnerEnv(reportPath), stdio: ['ignore', 'ignore', 'inherit'] }
  );
}

// The spawnRep parameter is a seam for tests only: the stale-report regression
// test substitutes a child that writes nothing.
export function runOneRep({ workers, rep, grep = '', outDir }, spawnRep = spawnPlaywrightRep) {
  const reportPath = join(outDir, `w${workers}-rep${rep}.json`);
  // A previous sweep pointed at the same --out leaves this rep's report on
  // disk, and a child that dies before writing one (a config error, say) would
  // hand that stale file to the accounting as a fresh green rep — the
  // false-green this harness exists to rule out. Deleted up front, so the
  // existsSync below can only be satisfied by a report this rep's child wrote.
  rmSync(reportPath, { force: true });
  const startedAt = Date.now();
  try {
    spawnRep({ workers, grep, reportPath });
    const meta = { workers, rep, jobSeconds: Math.round((Date.now() - startedAt) / 1000) };
    // Whatever went wrong with a rep — no server, no report, a crash — it is one
    // bad rep, not a reason to abandon the other thirty. An unattended sweep has
    // to survive it and say so, and summarizeSweep counts a rep with no `failed`
    // as red, which is the right accounting for a rep that never ran.
    if (!existsSync(reportPath)) throw new Error('playwright wrote no JSON report');
    return summarizeReport(readFileSync(reportPath, 'utf8'), meta);
  } catch (error) {
    return { w: workers, rep, error: String(error.message ?? error) };
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

export function runSweep({ workers, reps, grep = '', prebuilt = false, outDir }) {
  mkdirSync(outDir, { recursive: true });
  if (!prebuilt) buildPreviewBundle();
  const summaries = [];
  for (let rep = 1; rep <= reps; rep++) {
    const summary = runOneRep({ workers, rep, grep, outDir });
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
  // async because runMain chains .catch onto its callback's return value.
  runMain(async () => {
    const workers = Number(argFlag('workers'));
    const reps = Number(argFlag('reps', '5'));
    const grep = argFlag('grep', '');
    const prebuilt = process.argv.includes('--prebuilt');
    const outDir = argFlag('out', join(ROOT, 'sweep-runs'));
    if (!Number.isInteger(workers) || workers < 1) fail('--workers=<positive integer> is required');
    if (!Number.isInteger(reps) || reps < 1) fail('--reps must be a positive integer');
    const summaries = runSweep({ workers, reps, grep, prebuilt, outDir });
    // Individual red reps are measurement data, but a sweep in which nothing
    // ever executed measured nothing — that is a broken harness, and it must
    // not exit as if it had verified something (issue #1044).
    if (!summaries.some((s) => (s.tests ?? 0) > 0)) {
      fail('no rep executed a single test — see the SWEEPRESULT errors above');
    }
  });
}
