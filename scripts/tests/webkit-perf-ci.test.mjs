import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'test.yml'), 'utf8');

function job(id) {
  const body = workflow.match(new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1];
  if (!body) throw new Error(`Workflow job not found: ${id}`);
  return body;
}

describe('WebKit performance CI', () => {
  it('defines the fast scenario set once in the named npm script', () => {
    const fastScript = packageJson.scripts['perf:undo:webkit:fast'];

    expect(fastScript).toContain('--scenarios=multi-finger,crayon-scribbles');
    expect(workflow).toContain('npm run perf:undo:webkit:fast');
    expect(workflow).not.toContain('--scenarios=');
  });

  it('runs the fast subset on pull requests without weakening failures', () => {
    const fastJob = job('webkit-commit-gate-fast');

    expect(workflow).toContain('pull_request:');
    expect(fastJob).toContain("if: github.event_name == 'pull_request'");
    expect(fastJob).toContain('run: npm run perf:undo:webkit:fast');
    expect(fastJob).not.toContain('continue-on-error');
  });

  it('runs the full seven-scenario command on release tags', () => {
    const fullJob = job('webkit-commit-gate-full');

    expect(workflow).toContain("tags: ['v*']");
    expect(fullJob).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(fullJob).toContain('run: npm run perf:undo:webkit\n');
    expect(packageJson.scripts['perf:undo:webkit']).not.toContain('--scenarios=');
  });

  it.each(['webkit-commit-gate-fast', 'webkit-commit-gate-full'])(
    '%s uploads both diagnostic reports on failure',
    (jobId) => {
      const workflowJob = job(jobId);

      expect(workflowJob).toContain('if: failure()');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.json');
      expect(workflowJob).toContain('perf-profiles/**/undo-scenarios.md');
      expect(workflowJob).toContain('if-no-files-found: error');
      expect(workflowJob).not.toContain('continue-on-error');
    }
  );
});
