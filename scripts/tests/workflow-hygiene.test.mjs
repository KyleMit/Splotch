import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Line-oriented on purpose: no YAML parser ships in this repo's dependency
// tree, and these invariants (top-level keys, job-level keys, uses: refs) sit
// at fixed indentation in hand-written workflow files.
const repoRoot = join(import.meta.dirname, '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');
const actionsDir = join(repoRoot, '.github', 'actions');

const workflows = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => ({ name, lines: readFileSync(join(workflowsDir, name), 'utf8').split('\n') }));

const actions = readdirSync(actionsDir).map((name) => ({
  name: `actions/${name}`,
  lines: readFileSync(join(actionsDir, name, 'action.yml'), 'utf8').split('\n'),
}));

function jobs(lines) {
  const found = [];
  let inJobs = false;
  for (const line of lines) {
    if (/^jobs:/.test(line)) {
      inJobs = true;
      continue;
    }
    if (/^\S/.test(line)) inJobs = false;
    if (!inJobs) continue;
    const header = line.match(/^ {2}([\w-]+):/);
    if (header) found.push({ id: header[1], lines: [] });
    else found.at(-1)?.lines.push(line);
  }
  return found;
}

function usesRefs(lines) {
  return lines
    .map((line) => line.match(/^\s*(?:-\s+)?uses:\s*(\S+)/)?.[1])
    .filter((ref) => ref !== undefined);
}

describe('workflow hygiene', () => {
  it('found the workflows and composite actions', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(7);
    expect(actions.length).toBeGreaterThanOrEqual(3);
  });

  for (const { name, lines } of workflows) {
    describe(name, () => {
      it('declares a top-level permissions block', () => {
        expect(lines.some((line) => /^permissions:/.test(line))).toBe(true);
      });

      it('sets timeout-minutes on every job', () => {
        const all = jobs(lines);
        expect(all.length).toBeGreaterThan(0);
        for (const job of all) {
          expect
            .soft(
              job.lines.some((line) => /^ {4}timeout-minutes:\s*\d+/.test(line)),
              `job "${job.id}" has no timeout-minutes`
            )
            .toBe(true);
        }
      });
    });
  }

  for (const { name, lines } of [...workflows, ...actions]) {
    it(`${name} pins every external action to a 40-char SHA`, () => {
      for (const ref of usesRefs(lines)) {
        if (ref.startsWith('./')) continue;
        expect.soft(ref, `unpinned action "${ref}"`).toMatch(/@[0-9a-f]{40}$/);
      }
    });
  }
});
