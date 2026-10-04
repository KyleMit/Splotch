import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Line-oriented on purpose, like workflow-hygiene.test.mjs: no YAML parser ships in this repo's
// dependency tree, and a composite action's steps sit at a fixed indent.
const actionsDir = join(import.meta.dirname, '..', '..', '.github', 'actions');

const STEPS_KEY = /^ {2}steps:\s*$/;
const STEP_ITEM = /^ {4}- /;
const STEP_CONTENT = /^ {6}/;
const COMMENT_OR_BLANK = /^\s*(?:#.*)?$/;
const STEP_ID = /^ {4}(?:- | {2})id:\s*([\w-]+)\s*$/;
const STEP_RUN = /^ {4}(?:- | {2})run:\s*(.+?)\s*$/;
const BROWSER_CACHE_PATH = /^ {8}path:\s*\S*\/ms-playwright\s*$/;
const CACHE_KEY = /^ {8}key:\s*(.+?)\s*$/;
const STEP_OUTPUT_REFERENCE = /\bsteps\.([\w-]+)\.outputs\./g;

const RUNNER_SEGMENTS = [
  '${{ runner.os }}',
  '${{ runner.arch }}',
  '${{ steps.runner-image.outputs.os }}',
  '${{ steps.playwright-version.outputs.version }}',
];

// Each item of the action's `steps:` list as its content lines. YAML ignores comments, so one
// written between two steps belongs to neither.
function compositeSteps(action) {
  const lines = readFileSync(join(actionsDir, action, 'action.yml'), 'utf8').split('\n');
  const stepsKey = lines.findIndex((line) => STEPS_KEY.test(line));
  if (stepsKey === -1) throw new Error(`${action} has no runs.steps list`);

  const steps = [];
  for (const line of lines.slice(stepsKey + 1)) {
    if (COMMENT_OR_BLANK.test(line)) continue;
    if (STEP_ITEM.test(line)) steps.push([line]);
    else if (STEP_CONTENT.test(line) && steps.length > 0) steps.at(-1).push(line);
    else break;
  }
  return steps;
}

const matchIn = (step, pattern) => step.map((line) => line.match(pattern)?.[1]).find(Boolean);

// Playwright ships a separate browser build per OS release and CPU architecture, and a restored
// <browser>-<revision> directory counts as installed whichever runner image filled it.
describe.each([
  { action: 'setup-playwright', browserSet: '-${{ inputs.browsers }}-' },
  { action: 'setup-playwright-webkit', browserSet: '-webkit-' },
])('the $action browser cache', ({ action, browserSet }) => {
  const steps = compositeSteps(action);
  const cacheIndex = steps.findIndex((step) => step.some((line) => BROWSER_CACHE_PATH.test(line)));
  const cacheStep = steps[cacheIndex] ?? [];
  const key = matchIn(cacheStep, CACHE_KEY) ?? '';
  const stepIndex = (id) => steps.findIndex((step) => matchIn(step, STEP_ID) === id);

  it('keys on the runner OS release, architecture, browser set, and Playwright version', () => {
    expect(cacheIndex, `${action} has no ms-playwright cache step`).toBeGreaterThanOrEqual(0);
    for (const segment of [...RUNNER_SEGMENTS, browserSet]) expect(key).toContain(segment);
  });

  // An output read before its step runs evaluates to an empty string, silently dropping that
  // segment from the key.
  it('resolves every step output in its key before the cache step runs', () => {
    const producers = [...key.matchAll(STEP_OUTPUT_REFERENCE)].map(([, id]) => id);
    expect(producers).toContain('runner-image');
    for (const id of producers) {
      expect(stepIndex(id), `step ${id}`).toBeGreaterThanOrEqual(0);
      expect(stepIndex(id), `step ${id}`).toBeLessThan(cacheIndex);
    }
  });

  it('reads the runner image OS release from ImageOS', () => {
    const run = matchIn(steps[stepIndex('runner-image')] ?? [], STEP_RUN);
    expect(run).toMatch(/\bos=\$\{ImageOS\b/);
    expect(run).toContain('>> "$GITHUB_OUTPUT"');
  });

  it('restores only an exact key match', () => {
    expect(cacheStep.join('\n')).not.toContain('restore-keys:');
  });
});
