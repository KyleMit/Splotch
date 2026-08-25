import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

function job(id) {
  const body = workflow.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1];
  if (!body) throw new Error(`Workflow job not found: ${id}`);
  return body;
}

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

  // The timing tier landing after the merge only works if every merge actually
  // gets one. The workflow-level group folds a push's SHA in for exactly that
  // reason; without it, back-to-back merges to the same ref cancel each other
  // and a commit slips through with no coverage at all.
  it('never cancels a post-merge run in favour of a later commit', () => {
    expect(workflow).toContain(
      "group: ${{ github.workflow }}-${{ github.ref }}-${{ github.event_name == 'push' && github.sha || '' }}"
    );
  });

  // A gate that lands after the merge needs the failure to reach a human by
  // itself, and needs the write scope that requires.
  it('files the post-merge failure instead of waiting to be noticed', () => {
    const fastJob = job('webkit-commit-gate-fast');

    expect(fastJob).toContain('issues: write');
    expect(fastJob).toContain('name: File the failure');
    expect(fastJob).toContain('if: failure()');
    expect(fastJob).toContain('gh issue create');
    // One open issue collects every red commit; a broken main must not file one
    // issue per merge.
    expect(fastJob).toContain('gh issue comment');
  });

  // The filing step is a check-then-create, so "one open issue" only holds while
  // one gate job runs at a time. Both halves are asserted because each alone is
  // wrong: without the group two failing runs race and file duplicates, and with
  // the default `queue: single` a third commit cancels the pending run and loses
  // the coverage the per-SHA workflow group was added to preserve.
  it('serializes the post-merge gate without dropping a queued commit', () => {
    const fastJob = job('webkit-commit-gate-fast');
    const concurrency = fastJob.match(/\n {4}concurrency:\n((?: {6}.*\n)+)/)?.[1];

    expect(concurrency).toBeDefined();
    expect(concurrency).toContain('group: webkit-commit-gate-fast');
    expect(concurrency).toContain('queue: max');
    expect(concurrency).toContain('cancel-in-progress: false');
    // The group must be constant, not per-SHA — a SHA in it would serialize
    // nothing, since every run would get its own group.
    expect(concurrency).not.toContain('github.sha');
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

    expect(workflow).toContain('actions: read');
    expect(fullJob).toContain('name=webkit-undo-full-history');
    expect(fullJob).toContain('undo-fast-set-history.seed.json');
    expect(fullJob).toContain('name: webkit-undo-full-history');
    expect(fullJob).toContain('path: .perf-state/undo-fast-set-history.json');
    expect(fullJob).toContain('include-hidden-files: true');
    expect(fullJob).toContain('if: always()');
    expect(fullJob).toContain('retention-days: 90');
  });

  it('falls back to the committed seed when artifact transfer or extraction fails', () => {
    const fullJob = job('webkit-commit-gate-full');

    expect(fullJob).toContain('restore_ok=0');
    expect(fullJob).toContain('&& unzip -q "$archive_path" -d .perf-state');
    expect(fullJob).toContain('::warning::fast-set history restore failed');
    expect(fullJob).toContain('if [[ "$restore_ok" -eq 0 ]]');
  });

  it.each(['webkit-commit-gate-fast', 'webkit-commit-gate-full'])(
    '%s attempts both diagnostic reports without masking an earlier failure',
    (jobId) => {
      const workflowJob = job(jobId);

      expect(workflowJob).toContain(jobId.endsWith('fast') ? 'if: failure()' : 'if: always()');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.json');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.md');
      expect(workflowJob).toContain('if-no-files-found: warn');
      expect(workflowJob).not.toContain('continue-on-error');
    }
  );
});
