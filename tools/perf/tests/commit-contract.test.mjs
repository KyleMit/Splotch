import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { COMMIT_GATE_MS } from '../lib/undo-commit-gate.mjs';
import {
  COMMIT_CONTRACT_ARMS,
  formatCommitContract,
  judgeCommitContract,
  reduceCommitSession,
} from '../lib/commit-contract.mjs';
import { SESSION_PAYLOAD_FILE, sessionPollExpression } from '../ios/capture-commit-contract.mjs';

const BASELINE_PAYLOAD = join(
  ROOT,
  'docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/session-payload.js'
);

const session = (arm, commitsMs, overrides = {}) => ({
  arm,
  mode: 'paced',
  entry: 'start.abc.js',
  ua: 'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15',
  viewport: { W: 1366, H: 885, dpr: 2, orientation: 'LANDSCAPE' },
  measures: [
    ['engine.draw', 10, 0.4],
    ...commitsMs.map((ms, i) => ['engine.commit', 100 + i, ms]),
    ['engine.undo', 900, 3],
  ],
  ...overrides,
});

// Thirty commits, the paced session's stroke count.
const clean = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? 2 : 1));
const reduceBoth = (restamp, glaze) => [
  reduceCommitSession('restamp', restamp),
  reduceCommitSession('glaze-direct', glaze),
];

describe('reduceCommitSession', () => {
  it('scores the engine.commit P95 and max, ignoring every other measure', () => {
    const row = reduceCommitSession('restamp', session('restamp', clean));

    expect(row).toMatchObject({
      arm: 'restamp',
      commitSamples: 30,
      commitP95Ms: 2,
      commitMaxMs: 2,
      safari: '26.5',
    });
  });

  // Nearest rank over 30 samples is the 29th: the two slowest commits set it
  // only when both are slow.
  it('uses the nearest-rank percentile the runner gate uses', () => {
    const oneSlow = [...clean.slice(0, 29), 90];
    const twoSlow = [...clean.slice(0, 28), 80, 90];

    expect(reduceCommitSession('restamp', session('restamp', oneSlow)).commitP95Ms).toBe(2);
    expect(reduceCommitSession('restamp', session('restamp', twoSlow)).commitP95Ms).toBe(80);
  });

  it('reports a null P95, never zero, when the bundle recorded no commits', () => {
    const row = reduceCommitSession('restamp', session('restamp', [], { measures: [] }));

    expect(row.commitSamples).toBe(0);
    expect(row.commitP95Ms).toBeNull();
    expect(row.commitMaxMs).toBeNull();
  });

  it('carries a payload error through instead of scoring it', () => {
    expect(reduceCommitSession('restamp', { error: 'TypeError: boom\n at x' })).toEqual({
      arm: 'restamp',
      error: 'the session failed: TypeError: boom\n at x',
    });
  });
});

describe('judgeCommitContract', () => {
  it('passes when every arm is at or under COMMIT_GATE_MS', () => {
    const atGate = Array.from({ length: 30 }, () => COMMIT_GATE_MS);
    const judgement = judgeCommitContract(
      reduceBoth(session('restamp', clean), session('glaze-direct', atGate))
    );

    expect(judgement.verdict).toBe('pass');
    expect(judgement.gateMs).toBe(COMMIT_GATE_MS);
    expect(judgement.arms.map((arm) => arm.status)).toEqual(['pass', 'pass']);
  });

  it('breaches when one arm is past COMMIT_GATE_MS', () => {
    const slow = Array.from({ length: 30 }, () => COMMIT_GATE_MS + 0.5);
    const judgement = judgeCommitContract(
      reduceBoth(session('restamp', clean), session('glaze-direct', slow))
    );

    expect(judgement.verdict).toBe('breach');
    expect(judgement.arms.find((arm) => arm.arm === 'glaze-direct').status).toBe('breach');
    expect(formatCommitContract(judgement)).toContain('BREACH');
  });

  // The refusal ADR-0173 left owed on the device path: a bundle without
  // PERF_MARKS has no commit samples, and that must not read as a clean pass.
  it('refuses a null commit P95 as not evaluated, naming PERF_MARKS', () => {
    const unmarked = { measures: [] };
    const judgement = judgeCommitContract(
      reduceBoth(session('restamp', [], unmarked), session('glaze-direct', [], unmarked))
    );

    expect(judgement.verdict).toBe('not-evaluated');
    expect(judgement.arms.every((arm) => arm.status === 'not-evaluated')).toBe(true);
    expect(judgement.arms[0].reason).toContain('PERF_MARKS');
    expect(formatCommitContract(judgement)).toContain('this is not a pass');
  });

  it('refuses when one arm is unmarked even though the other passes', () => {
    const judgement = judgeCommitContract(
      reduceBoth(session('restamp', clean), session('glaze-direct', [], { measures: [] }))
    );

    expect(judgement.verdict).toBe('not-evaluated');
  });

  // A non-finite duration crosses the inspector's JSON as null, and null sorts
  // as 0 — one such sample alone would otherwise score a 0 ms pass.
  it('refuses an arm with a commit sample that has no finite duration', () => {
    const withNull = session('restamp', clean);
    withNull.measures.push(['engine.commit', 500, null]);
    const judgement = judgeCommitContract(reduceBoth(withNull, session('glaze-direct', [null])));

    expect(judgement.verdict).toBe('not-evaluated');
    expect(judgement.arms.map((arm) => arm.reason)).toEqual([
      '1 of 31 engine.commit samples have no finite duration',
      '1 of 1 engine.commit samples have no finite duration',
    ]);
  });

  it('refuses a missing arm', () => {
    const judgement = judgeCommitContract([
      reduceCommitSession('restamp', session('restamp', clean)),
    ]);

    expect(judgement.verdict).toBe('not-evaluated');
    expect(judgement.arms[1]).toMatchObject({
      arm: 'glaze-direct',
      reason: 'the arm was not captured',
    });
  });

  it('refuses an arm whose page ran a different pipeline', () => {
    const judgement = judgeCommitContract(
      reduceBoth(session('restamp', clean), session('restamp', clean))
    );

    expect(judgement.verdict).toBe('not-evaluated');
    expect(judgement.arms[1].reason).toContain('ran the restamp arm');
  });

  it('refuses a failed or absent session', () => {
    const judgement = judgeCommitContract([
      reduceCommitSession('restamp', { error: 'ReferenceError: E is not defined' }),
      reduceCommitSession('glaze-direct', null),
    ]);

    expect(judgement.verdict).toBe('not-evaluated');
    expect(judgement.arms.map((arm) => arm.reason)).toEqual([
      'the session failed: ReferenceError: E is not defined',
      'the session published no result',
    ]);
  });
});

describe('sessionPollExpression', () => {
  const read = (nonce, page) =>
    new Function('window', `return ${sessionPollExpression(nonce)}`)(page);

  // An older tab on the same URL can hold a finished session from an earlier run.
  it('ignores a tab this run did not inject', () => {
    const stale = { __commitContractNonce: 'earlier-run', __session: { arm: 'restamp' } };

    expect(read('this-run', stale)).toBeNull();
    expect(read('this-run', { __session: { arm: 'restamp' } })).toBeNull();
  });

  it('reads the session and progress from the tab carrying this run nonce', () => {
    const running = { __commitContractNonce: 'this-run', __sessionProgress: 'stroke 3/30' };
    const done = { ...running, __session: { arm: 'restamp' }, __sessionProgress: 'done' };

    expect(read('this-run', running)).toEqual({ session: null, progress: 'stroke 3/30' });
    expect(read('this-run', done)).toEqual({ session: { arm: 'restamp' }, progress: 'done' });
  });
});

describe('the release check', () => {
  it('runs both deposition arms', () => {
    expect(COMMIT_CONTRACT_ARMS).toEqual(['restamp', 'glaze-direct']);
  });

  // ADR-0173 compares every release reading with the 2026-09-18 baseline, which
  // only holds while the page runs the same workload. Changing the payload ends
  // that comparability: re-baseline on the device and amend ADR-0173 with it.
  it('injects the 2026-09-18 baseline payload unchanged', () => {
    expect(readFileSync(SESSION_PAYLOAD_FILE, 'utf8')).toBe(readFileSync(BASELINE_PAYLOAD, 'utf8'));
  });
});
