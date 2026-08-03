import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  COMMIT_GATE_MS,
  CRAYON_DRAW_REFERENCE_MS_PER_CALL,
  evaluateCommitTiming,
} from '../perf/undo-commit-gate.mjs';
import { ALL_UNDO_SCENARIO_KEYS, FAST_UNDO_SCENARIO_KEYS } from '../perf/undo-scenario-keys.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
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

describe('WebKit performance CI', () => {
  it('defines the fast scenario set once and resolves every key through the scenario registry', () => {
    const fastScript = packageJson.scripts['perf:undo:webkit:fast'];

    expect(FAST_UNDO_SCENARIO_KEYS).toEqual(['multi-finger', 'crayon-scribbles']);
    expect(FAST_UNDO_SCENARIO_KEYS.every((key) => ALL_UNDO_SCENARIO_KEYS.includes(key))).toBe(true);
    expect(fastScript).toContain('--suite=fast');
    expect(fastScript).not.toContain('--scenarios=');
    expect(workflow).toContain('npm run perf:undo:webkit:fast');
    expect(workflow).not.toContain('--scenarios=');
  });

  it('installs and caches WebKit once through the macOS-specific composite action', () => {
    expect(setupAction).toContain('uses: ./.github/actions/setup-node');
    expect(setupAction).toContain('path: ~/Library/Caches/ms-playwright');
    expect(setupAction).toContain('run: npx playwright install webkit');
    expect(setupAction).not.toContain('install-deps');
    expect(setupAction).not.toContain('--with-deps');

    for (const jobId of ['webkit-commit-gate-fast', 'webkit-commit-gate-full']) {
      const workflowJob = job(jobId);
      expect(workflowJob).toContain('uses: ./.github/actions/setup-playwright-webkit');
      expect(workflowJob).not.toContain('Resolve Playwright version');
      expect(workflowJob).not.toContain('Cache Playwright browser');
    }
  });

  it('runs the fast subset on pull requests without weakening failures', () => {
    const fastJob = job('webkit-commit-gate-fast');

    expect(workflow).toContain('pull_request:');
    expect(fastJob).toContain("if: github.event_name == 'pull_request'");
    expect(fastJob).toContain('runs-on: macos-latest');
    expect(fastJob).toContain('run: npm run perf:undo:webkit:fast');
    expect(fastJob).not.toContain('continue-on-error');
  });

  it('normalizes shared-runner crayon slowdown while preserving the 25 ms work-shape gate', () => {
    const noisyHealthy = evaluateCommitTiming(
      timingScenario({ commitP95Ms: 60, drawTotalMs: 100_186, drawOps: 26_378 }),
      { normalizeSharedRunnerCrayon: true }
    );
    const knownBad = evaluateCommitTiming(
      timingScenario({
        commitP95Ms: 47,
        drawTotalMs: CRAYON_DRAW_REFERENCE_MS_PER_CALL * 26_378,
        drawOps: 26_378,
      }),
      { normalizeSharedRunnerCrayon: true }
    );
    const encodeRegression = evaluateCommitTiming(
      timingScenario({
        key: 'multi-finger',
        commitP95Ms: 47,
        drawTotalMs: 100_186,
        drawOps: 26_378,
      }),
      { normalizeSharedRunnerCrayon: true }
    );

    expect(noisyHealthy).toMatchObject({ normalized: true, breached: false });
    expect(noisyHealthy.gateP95Ms).toBeLessThan(COMMIT_GATE_MS);
    expect(knownBad).toMatchObject({ slowdownFactor: 1, gateP95Ms: 47, breached: true });
    expect(encodeRegression).toMatchObject({ normalized: false, gateP95Ms: 47, breached: true });
  });

  it('keeps full and on-demand WebKit runs on raw absolute timing', () => {
    const timing = evaluateCommitTiming(
      timingScenario({ commitP95Ms: 60, drawTotalMs: 100_186, drawOps: 26_378 })
    );

    expect(timing).toMatchObject({ normalized: false, gateP95Ms: 60, breached: true });
  });

  it('runs the full seven-scenario command on release tags', () => {
    const fullJob = job('webkit-commit-gate-full');

    expect(workflow).toContain("tags: ['v*']");
    expect(fullJob).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(fullJob).toContain('runs-on: macos-latest');
    expect(fullJob).toContain(
      'run: npm run perf:undo:webkit -- --fast-set-history=.perf-state/undo-fast-set-history.json'
    );
    expect(packageJson.scripts['perf:undo:webkit']).not.toContain('--scenarios=');
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
