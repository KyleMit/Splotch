// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { QUALITY_COMMANDS, runQualityChecks, summarize } from '../run-quality-checks.mjs';

// `npm run check:quality` exists so the Quality job is reproducible before pushing —
// which it only is while it runs the same commands. The workflow is YAML and
// cannot import the list, so the two sides are compared here instead: a step
// added to CI and not to the script leaves the script quietly under-checking,
// which is the exact failure it was written to prevent.
const repoRoot = join(import.meta.dirname, '..', '..');
const workflow = readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8');
const pnpmWorkspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
const dependencyAuditCommand = 'pnpm audit --audit-level=high';

// The `quality:` job's block, from its key to the next top-level job key.
function qualityJobBlock(yaml) {
  const start = yaml.indexOf('\n  quality:\n');
  if (start === -1) throw new Error('No quality job in .github/workflows/test.yml');
  const rest = yaml.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function commandsIn(block) {
  return [...block.matchAll(/^ +run: (.+)$/gm)].map(([, command]) => command.trim());
}

describe('the quality script mirrors the Quality job', () => {
  it('runs exactly the workflow steps, in the workflow order', () => {
    expect(QUALITY_COMMANDS).toEqual(commandsIn(qualityJobBlock(workflow)));
  });

  it('blocks high and critical dependency advisories without broad exclusions', () => {
    expect(QUALITY_COMMANDS).toContain(dependencyAuditCommand);
    expect(QUALITY_COMMANDS.filter((command) => command.startsWith('pnpm audit'))).toEqual([
      dependencyAuditCommand,
    ]);
    expect(pnpmWorkspace).not.toMatch(/^auditConfig:/m);
  });

  it('picks the quality job, not whatever job happens to be first', () => {
    const block = qualityJobBlock(workflow);
    expect(block).toContain('name: Quality');
    expect(block).not.toContain('npm run test:e2e');
  });
});

describe('runQualityChecks', () => {
  it('runs every check even after one fails, and reports each failure', () => {
    const attempted = [];
    const failures = runQualityChecks({
      run: (command) => {
        attempted.push(command);
        return !command.startsWith('npm run lint');
      },
    });

    expect(attempted).toEqual(QUALITY_COMMANDS);
    expect(failures).toEqual(QUALITY_COMMANDS.filter((c) => c.startsWith('npm run lint')));
  });

  it('exits non-zero and names the failures, or zero when all pass', () => {
    const errors = [];
    const log = { log: () => {}, error: (line) => errors.push(line) };

    expect(summarize([], log)).toBe(0);
    expect(errors).toEqual([]);

    expect(summarize(['npm run lint'], log)).toBe(1);
    expect(errors.join('\n')).toContain('npm run lint');
  });
});
