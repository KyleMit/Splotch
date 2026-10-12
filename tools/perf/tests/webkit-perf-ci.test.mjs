import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { jobBlock, stepBlock } from '../../ci-mirror/tests/workflow-job-steps.mjs';
import {
  BREACH_CONFIRMATIONS,
  COMMIT_GATE_MS,
  CRAYON_DRAW_REFERENCE_TOTAL_MS,
  NORMALIZATION_ENABLED,
  confirmedBreach,
  evaluateCommitTiming,
} from '../lib/undo-commit-gate.mjs';
import { ALL_UNDO_SCENARIO_KEYS, FAST_UNDO_SCENARIO_KEYS } from '../lib/undo-scenario-keys.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'test.yml'), 'utf8');
const setupAction = readFileSync(
  join(repoRoot, '.github', 'actions', 'setup-playwright-webkit', 'action.yml'),
  'utf8'
);

const job = (id) => jobBlock(workflow, id);

function timingScenario({ key = 'crayon-scribbles', commitP95Ms, drawTotalMs, drawOps }) {
  return {
    key,
    draw: {
      commitP95Ms,
      totalMs: drawTotalMs,
      ops: drawOps,
    },
  };
}

// A real capture from the current mark regime, kept so the gate is exercised
// against what the app actually emits rather than against a hand-written shape.
// The fixture is what makes the unit drift in issue 1247 impossible to reintroduce
// silently: it records 22 `engine.draw` measures per scenario where the old
// per-operation marks gave tens of thousands.
const capture = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'undo-scenarios-webkit-fast.json'), 'utf8')
);
const captured = (key) => capture.scenarios.find((scenario) => scenario.key === key);

describe('WebKit performance CI', () => {
  it('defines the fast scenario set once and resolves every key through the scenario registry', () => {
    const fastScript = packageJson.scripts['perf:web:undo:webkit:fast'];

    expect(FAST_UNDO_SCENARIO_KEYS).toEqual(['multi-finger', 'crayon-scribbles']);
    expect(FAST_UNDO_SCENARIO_KEYS.every((key) => ALL_UNDO_SCENARIO_KEYS.includes(key))).toBe(true);
    expect(fastScript).toContain('--suite=fast');
    expect(fastScript).not.toContain('--scenarios=');
    expect(workflow).toContain('npm run perf:web:undo:webkit:fast');
    expect(workflow).not.toContain('--scenarios=');
  });

  it('installs and caches WebKit once through the macOS-specific composite action', () => {
    expect(setupAction).toContain('uses: ./.github/actions/setup-pnpm');
    expect(setupAction).toContain('path: ~/Library/Caches/ms-playwright');
    // What this guards is that WebKit is installed here and that no apt work
    // leaks in, not the spelling of the command. The install is deliberately
    // unbounded — the calling job's timeout-minutes is the backstop for a
    // starved runner.
    expect(setupAction).toContain('npx playwright install webkit');
    expect(setupAction).not.toContain('install-deps');
    expect(setupAction).not.toContain('--with-deps');

    for (const jobId of ['webkit-commit-gate-fast', 'webkit-commit-gate-full']) {
      const workflowJob = job(jobId);
      expect(workflowJob).toContain('uses: ./.github/actions/setup-playwright-webkit');
      expect(workflowJob).not.toContain('Resolve Playwright version');
      expect(workflowJob).not.toContain('Cache Playwright browser');
    }
  });

  it('runs the fast subset post-merge on main without weakening failures', () => {
    const fastJob = job('webkit-commit-gate-fast');

    expect(workflow).toContain('pull_request:');
    // Post-merge coverage is the invariant; the workflow_dispatch arm is
    // additive so the gate can be exercised on demand without a merge.
    expect(fastJob).toContain(
      "(github.event_name == 'push' && github.ref == 'refs/heads/main') ||"
    );
    expect(fastJob).toContain(
      '(github.event_name == \'workflow_dispatch\' && contains(fromJSON(\'["fast", "both"]\'), inputs.gate))'
    );
    expect(fastJob).toContain('runs-on: macos-latest');
    expect(fastJob).toContain('run: npm run perf:web:undo:webkit:fast');
    expect(fastJob).not.toContain('continue-on-error');
  });

  it('surfaces green gate findings and reporter failures without changing retry inputs', () => {
    const fastJob = job('webkit-commit-gate-fast');
    const verdict = stepBlock(fastJob, 'Record the gate verdict');
    const summary = stepBlock(fastJob, 'Surface WebKit gate finding on green runs');

    expect(verdict).toContain(
      'if raw_fingerprint=$(node tools/perf/report-undo-gate-failures.mjs)'
    );
    expect(verdict).toContain("echo 'reporter-failed=true'");
    expect(verdict).toContain("echo 'failures='");
    expect(summary).toContain("steps.gate.outcome == 'success'");
    expect(summary).toContain("steps.verdict.outputs.failures != ''");
    expect(summary).toContain("steps.verdict.outputs.reporter-failed == 'true'");
    expect(summary).toContain('GITHUB_STEP_SUMMARY');
  });

  // The timing tier landing after the merge only works if every merge actually
  // gets one. The workflow-level group folds a push's SHA in for exactly that
  // reason; without it, back-to-back merges to the same ref cancel each other
  // and a commit slips through with no coverage at all.
  it('never cancels a post-merge run in favour of a later commit', () => {
    expect(workflow).toContain(
      "group: ${{ github.workflow }}-${{ github.ref }}-${{ github.event_name == 'push' && github.sha || '' }}"
    );
  });

  it('reports the fresh-runner reproduction from a separate write-scoped job', () => {
    const fastJob = job('webkit-commit-gate-fast');
    const retryJob = job('webkit-commit-gate-fast-retry');
    const reportJob = job('webkit-commit-gate-fast-report');

    for (const measurement of [fastJob, retryJob]) {
      expect(measurement).not.toContain('name: File the failure');
      expect(measurement).not.toContain('issues: write');
      expect(measurement).not.toMatch(/^ {4}concurrency:/m);
    }
    expect(fastJob).toContain('gate-outcome: ${{ steps.verdict.outputs.gate }}');
    expect(fastJob).toContain('gate-failures: ${{ steps.verdict.outputs.failures }}');
    expect(retryJob).toContain("needs.webkit-commit-gate-fast.outputs.gate-outcome == 'failure'");
    expect(retryJob).toContain('always()');
    expect(retryJob).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(retryJob).toContain('needs: webkit-commit-gate-fast');
    expect(retryJob).toContain('Record the non-reproduction');
    expect(retryJob).toContain('Fail on a reproduced breach');
    expect(retryJob).toContain('needs.webkit-commit-gate-fast.outputs.gate-failures');
    expect(retryJob).toContain('report-undo-gate-failures.mjs --first=');
    expect(retryJob).toContain('npm run perf:web:undo:webkit:fast');
    expect(reportJob).toContain('needs: webkit-commit-gate-fast-retry');
    expect(reportJob).toContain('issues: write');
    expect(reportJob).toContain('gh issue create');
    expect(reportJob).toContain('gh issue comment');
  });

  // Comparator errors cannot masquerade as an empty fingerprint. The retry
  // classifies its step outcome; the downstream reporter receives that outcome
  // independently of the retry's implicit step success conditions.
  it('preserves fail-closed retry and report behavior when comparison fails', () => {
    const retryJob = job('webkit-commit-gate-fast-retry');
    const compare = stepBlock(retryJob, "Compare this runner's failure with the first runner's");
    const fileFailure = stepBlock(job('webkit-commit-gate-fast-report'), 'File the failure');
    const nonReproduction = stepBlock(retryJob, 'Record the non-reproduction');
    const reFail = stepBlock(retryJob, 'Fail on a reproduced breach');

    // Keep the local classification steps eligible after a failed comparison.
    expect(compare).toContain('continue-on-error: true');

    // webkit-failure-reporter.test.mjs pins the reporter to this predicate.
    expect(reFail).toContain("steps.compare.outcome == 'failure'");
    expect(reFail).toContain("steps.compare.outputs.reproduced != ''");

    // And the acquittal requires a comparison that actually succeeded — an
    // empty `reproduced` is also what a crashed step reports.
    expect(nonReproduction).toContain("steps.compare.outcome == 'success'");
    expect(nonReproduction).toContain("steps.compare.outputs.reproduced == ''");

    // The filed issue says which case it is, so a fail-closed filing is not
    // read as a confirmed regression.
    expect(fileFailure).toContain(
      'COMPARE_OUTCOME: ${{ needs.webkit-commit-gate-fast-retry.outputs.compare-outcome }}'
    );
    expect(fileFailure).toContain('filed fail-closed');
  });

  // The issue body is the first thing an investigator reads. It described a
  // normalized gate value and cited ADR-0093 for why it differs from the raw
  // P95 — but ADR-0140 retired normalization, so that sent the reader down a
  // path that no longer exists (the PR 1573 review).
  it('points a filed issue at the raw P95 rather than a retired normalized value', () => {
    const fileFailure = stepBlock(job('webkit-commit-gate-fast-report'), 'File the failure');
    expect(fileFailure).toContain('Nothing is normalized');
    expect(fileFailure).toContain('ADR-0140');
    expect(fileFailure).not.toContain('normalized gate value');
  });

  it('retires the obsolete blob-encoding structural gate', () => {
    expect(packageJson.scripts['perf:undo:encode-path']).toBeUndefined();
    expect(workflow).not.toContain('commit-path-guard:');
    expect(workflow).not.toContain('perf:undo:encode-path');
    expect(workflow).not.toContain('Commit path guard');
  });

  // Normalization is OFF. The reference came from one passing rerun quoted in issue
  // 1247 and nothing measured supported the 4x cap, while three runs of the same
  // suite reported 8,135 / 9,685 / 13,843 ms — host dependence far larger than the
  // evidence the constants rested on. A divisor derived from one number can divide a
  // real breach into a pass, and `Math.max(1, ...)` means it can only move a score
  // that way. The gate scores the raw P95 and confirms a breach instead (ADR-0140).
  it('does not discount any scenario, however slow the host was', () => {
    const slowHost = evaluateCommitTiming(
      timingScenario({ commitP95Ms: 60, drawTotalMs: CRAYON_DRAW_REFERENCE_TOTAL_MS * 8 }),
      { normalizeSharedRunnerCrayon: true }
    );

    expect(slowHost).toMatchObject({
      normalized: false,
      slowdownFactor: 1,
      gateP95Ms: 60,
      breached: true,
      evaluable: true,
    });
    expect(NORMALIZATION_ENABLED).toBe(false);
  });

  // Measured and reported so the distribution the constants need can be collected
  // from ordinary runs rather than from a special one.
  it('still records how slow the host was on the scenario the reference describes', () => {
    const crayon = evaluateCommitTiming(
      timingScenario({ commitP95Ms: 1, drawTotalMs: CRAYON_DRAW_REFERENCE_TOTAL_MS * 2 })
    );
    const other = evaluateCommitTiming(
      timingScenario({ key: 'multi-finger', commitP95Ms: 1, drawTotalMs: 66 })
    );

    expect(crayon.hostSlowdown).toBeCloseTo(2, 6);
    expect(other.hostSlowdown).toBeNull();
  });

  // Issue 1247: the divisor used to be `totalMs / ops` against a per-operation
  // reference, and moving `engine.draw` into `drainQueues()` rescaled `ops` by
  // three orders of magnitude without anything noticing. Against this real capture
  // that formula divides by 924 and the gate cannot fail at any commit cost.
  it('cannot be rescaled by a change to engine.draw marking granularity', () => {
    const crayon = captured('crayon-scribbles');

    expect(crayon.draw.ops).toBeLessThan(100);
    const perCallDivisor = crayon.draw.totalMs / crayon.draw.ops / 0.4;
    expect(perCallDivisor).toBeGreaterThan(500);

    const timing = evaluateCommitTiming(
      { key: crayon.key, draw: { ...crayon.draw, commitP95Ms: 40 } },
      { normalizeSharedRunnerCrayon: true }
    );

    expect(timing.slowdownFactor).toBe(1);
    expect(timing.gateP95Ms).toBe(40);
    expect(timing.breached).toBe(true);
  });

  it('scores a real healthy capture well inside the budget', () => {
    for (const scenario of capture.scenarios) {
      const timing = evaluateCommitTiming(scenario, { normalizeSharedRunnerCrayon: true });

      expect(timing.evaluable).toBe(true);
      expect(timing.breached).toBe(false);
      expect(timing.gateP95Ms).toBeLessThan(COMMIT_GATE_MS);
    }
  });

  it('keeps full and on-demand WebKit runs on raw absolute timing', () => {
    const timing = evaluateCommitTiming(
      timingScenario({ commitP95Ms: 60, drawTotalMs: CRAYON_DRAW_REFERENCE_TOTAL_MS * 3 })
    );

    expect(timing).toMatchObject({ normalized: false, gateP95Ms: 60, breached: true });
  });

  // The gate's percentile over ~21 commit samples resolves to the second-highest
  // sample, so two adjacent slow commits set it — which is what a shared-runner
  // stall produces. Measured at one commit on main: 133.0 ms, then 2.0 ms on a
  // re-run of the same job.
  it('acquits a scenario only when a second measurement came back clean', () => {
    const breaching = evaluateCommitTiming(
      timingScenario({ key: 'multi-finger', commitP95Ms: 133, drawTotalMs: 1 })
    );
    const clean = evaluateCommitTiming(
      timingScenario({ key: 'multi-finger', commitP95Ms: 2, drawTotalMs: 1 })
    );

    expect(BREACH_CONFIRMATIONS).toBe(2);
    expect(confirmedBreach([breaching, clean])).toBe('acquitted');
    expect(confirmedBreach([breaching, breaching])).toBe('confirmed');
    expect(confirmedBreach([breaching])).toBe('unconfirmed');
  });

  // An earlier revision filtered to evaluable timings first, so a confirmation that
  // produced nothing left one timing in the list, fell under the confirmation count,
  // and was reported as "breached once and not again" — a real first-pass breach
  // acquitted by a measurement that could not be scored.
  it('does not let an unscoreable confirmation acquit a first-pass breach', () => {
    const breaching = evaluateCommitTiming(
      timingScenario({ key: 'multi-finger', commitP95Ms: 133, drawTotalMs: 1 })
    );
    const unscoreable = evaluateCommitTiming(
      timingScenario({ key: 'multi-finger', commitP95Ms: Number.NaN, drawTotalMs: 1 })
    );

    expect(unscoreable.evaluable).toBe(false);
    expect(confirmedBreach([breaching, unscoreable])).toBe('unconfirmed');
    expect(confirmedBreach([breaching, unscoreable])).not.toBe('acquitted');
  });

  it('runs the full seven-scenario command on release tags', () => {
    const fullJob = job('webkit-commit-gate-full');

    expect(workflow).toContain("tags: ['v*']");
    expect(fullJob).toContain(
      "(github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')) ||"
    );
    expect(fullJob).toContain(
      '(github.event_name == \'workflow_dispatch\' && contains(fromJSON(\'["full", "both"]\'), inputs.gate))'
    );
    expect(fullJob).toContain('runs-on: macos-latest');
    expect(fullJob).toContain(
      'run: npm run perf:web:undo:webkit -- --fast-set-history=.perf-state/undo-fast-set-history.json'
    );
    expect(packageJson.scripts['perf:web:undo:webkit']).not.toContain('--scenarios=');
  });

  it('restores and durably persists the rolling full-run history', () => {
    const fullJob = job('webkit-commit-gate-full');
    // The upload's release-tag condition is pinned by workflow-gates.test.mjs.
    const persist = stepBlock(fullJob, 'Persist WebKit full-run history');

    expect(workflow).toContain('actions: read');
    expect(fullJob).toContain('name=webkit-undo-full-history');
    expect(fullJob).toContain('undo-fast-set-history.seed.json');
    expect(persist).toContain('name: webkit-undo-full-history');
    expect(persist).toContain('path: .perf-state/undo-fast-set-history.json');
    expect(persist).toContain('include-hidden-files: true');
    expect(persist).toContain('retention-days: 90');
  });

  it('falls back to the committed seed when artifact transfer or extraction fails', () => {
    const fullJob = job('webkit-commit-gate-full');

    expect(fullJob).toContain('restore_ok=0');
    expect(fullJob).toContain('&& unzip -q "$archive_path" -d .perf-state');
    expect(fullJob).toContain('::warning::fast-set history restore failed');
    expect(fullJob).toContain('if [[ "$restore_ok" -eq 0 ]]');
  });

  it.each(['webkit-commit-gate-fast', 'webkit-commit-gate-fast-retry', 'webkit-commit-gate-full'])(
    '%s attempts both diagnostic reports without masking an earlier failure',
    (jobId) => {
      const workflowJob = job(jobId);

      // Green runs upload too (issue 1250): the noise investigation had
      // outcomes but no distributions, because only failures kept their tables.
      expect(workflowJob).toContain('if: always()');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.json');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.md');
      expect(workflowJob).toContain('if-no-files-found: warn');
    }
  );

  it.each(['webkit-commit-gate-fast', 'webkit-commit-gate-full'])(
    '%s keeps its gate step terminal — no continue-on-error',
    (jobId) => {
      expect(job(jobId)).not.toContain('continue-on-error');
    }
  );

  // The retry's gate step is continue-on-error so the filing and
  // non-reproduction steps always run from its recorded outcome; the masking
  // that would otherwise allow is closed by the explicit re-fail step.
  it('the retry gate step is continue-on-error, with the re-fail step closing the mask', () => {
    const retryJob = job('webkit-commit-gate-fast-retry');
    expect(retryJob).toContain('continue-on-error: true');
    expect(retryJob).toContain('Fail on a reproduced breach');
  });
});
