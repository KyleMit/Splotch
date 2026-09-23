// The per-release commit-latency contract on the physical iPad (ADR-0173):
// one finger-paced crayon session per deposition arm, each scored as the
// `engine.commit` P95 against COMMIT_GATE_MS. The reduction is the commit half
// of the 2026-09-18 baseline analyzer
// (docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/analyze.mjs), with
// the percentile the runner gate uses, so a release reading lines up with both.
import { COMMIT_GATE_MS, COMMIT_GATE_PERCENTILE } from './undo-commit-gate.mjs';
import { percentile } from './real-screen-stats.mjs';

// `restamp` is the Safari/web deposition pipeline and `glaze-direct` the
// native one; the contract holds on both.
export const COMMIT_CONTRACT_ARMS = ['restamp', 'glaze-direct'];

const COMMIT_MEASURE = 'engine.commit';

const safariVersion = (ua) => /Version\/([\d.]+)/.exec(ua ?? '')?.[1] ?? null;

// `session` is the payload's `window.__session`. A bundle built without
// PERF_MARKS records no engine measures at all, so its commit P95 is null —
// never 0, which would read as the cleanest possible pass.
export function reduceCommitSession(arm, session) {
  if (!session) return { arm, error: 'the session published no result' };
  if (session.error) return { arm, error: `the session failed: ${session.error}` };
  const samples = (session.measures ?? [])
    .filter(([name]) => name === COMMIT_MEASURE)
    .map(([, , durationMs]) => durationMs);
  return {
    arm,
    sessionArm: session.arm,
    mode: session.mode,
    entry: session.entry,
    viewport: session.viewport,
    safari: safariVersion(session.ua),
    commitSamples: samples.length,
    commitP95Ms: percentile(samples, COMMIT_GATE_PERCENTILE) ?? null,
    commitMaxMs: samples.length ? Math.max(...samples) : null,
  };
}

function armProblem(row) {
  if (row.error) return row.error.split('\n')[0];
  if (row.sessionArm !== row.arm) {
    return `the page ran the ${row.sessionArm} arm, not ${row.arm}`;
  }
  if (row.commitP95Ms === null) {
    return (
      `no ${COMMIT_MEASURE} samples — the served bundle was built without PERF_MARKS. ` +
      'Rebuild with `npm run perf:build` (or let the pre-hook run) and capture again'
    );
  }
  return null;
}

// Three outcomes, and only `pass` exits zero. `not-evaluated` is a refusal, not
// a soft pass: an arm that could not be scored says nothing about the contract.
export function judgeCommitContract(rows) {
  const arms = COMMIT_CONTRACT_ARMS.map((arm) => {
    const row = rows.find((candidate) => candidate.arm === arm);
    if (!row) return { arm, status: 'not-evaluated', reason: 'the arm was not captured' };
    const problem = armProblem(row);
    if (problem) return { ...row, status: 'not-evaluated', reason: problem };
    return { ...row, status: row.commitP95Ms > COMMIT_GATE_MS ? 'breach' : 'pass' };
  });
  const statuses = arms.map((arm) => arm.status);
  const verdict = statuses.includes('not-evaluated')
    ? 'not-evaluated'
    : statuses.includes('breach')
      ? 'breach'
      : 'pass';
  return { gateMs: COMMIT_GATE_MS, percentile: COMMIT_GATE_PERCENTILE, verdict, arms };
}

export function formatCommitContract({ gateMs, verdict, arms }) {
  const lines = arms.map((arm) =>
    arm.status === 'not-evaluated'
      ? `  ${arm.arm.padEnd(12)} NOT EVALUATED: ${arm.reason}`
      : `  ${arm.arm.padEnd(12)} commit p95/max ${arm.commitP95Ms}/${arm.commitMaxMs} ms ` +
        `over ${arm.commitSamples} commits (${arm.viewport.W}x${arm.viewport.H} ` +
        `${arm.viewport.orientation}) — ${arm.status === 'pass' ? 'PASS' : 'BREACH'}`
  );
  const summary = {
    pass: `PASS: commit P95 ≤ ${gateMs} ms on every arm`,
    breach: `BREACH: commit P95 above ${gateMs} ms — this blocks the release (ADR-0173)`,
    'not-evaluated': 'NOT EVALUATED: at least one arm could not be scored; this is not a pass',
  }[verdict];
  return [...lines, summary].join('\n');
}
