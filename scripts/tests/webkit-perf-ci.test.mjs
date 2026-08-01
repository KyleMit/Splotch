import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ALL_UNDO_SCENARIO_KEYS } from '../perf/undo-scenario-keys.mjs';

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

describe('WebKit performance CI', () => {
  it('defines the fast scenario set once and resolves every key through the scenario registry', () => {
    const fastScript = packageJson.scripts['perf:undo:webkit:fast'];
    const fastKeys = fastScript.match(/--scenarios=([^\s]+)/)?.[1].split(',') ?? [];

    expect(fastKeys).toEqual(['multi-finger', 'crayon-scribbles']);
    expect(fastKeys.every((key) => ALL_UNDO_SCENARIO_KEYS.includes(key))).toBe(true);
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

  it('runs the full seven-scenario command on release tags', () => {
    const fullJob = job('webkit-commit-gate-full');

    expect(workflow).toContain("tags: ['v*']");
    expect(fullJob).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(fullJob).toContain('runs-on: macos-latest');
    expect(fullJob).toContain('run: npm run perf:undo:webkit\n');
    expect(packageJson.scripts['perf:undo:webkit']).not.toContain('--scenarios=');
  });

  it.each(['webkit-commit-gate-fast', 'webkit-commit-gate-full'])(
    '%s attempts both diagnostic reports without masking an earlier failure',
    (jobId) => {
      const workflowJob = job(jobId);

      expect(workflowJob).toContain('if: failure()');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.json');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.md');
      expect(workflowJob).toContain('if-no-files-found: warn');
      expect(workflowJob).not.toContain('continue-on-error');
    }
  );
});
