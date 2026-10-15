// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  jobBlock,
  runCommandsIn,
  testWorkflow,
} from '../../ci-mirror/tests/workflow-job-steps.mjs';

// The React Native candidate's checks sit outside everything else CI runs: `npm run check` never
// reads its TypeScript project, and test:tools excludes its renderer tests. Neither protects a pull
// request unless a job names it, so each command is held to the job that runs it and each script
// to what it must invoke.
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const { scripts } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const nativeTsconfig = JSON.parse(
  readFileSync(join(repoRoot, 'experiments/native-architecture/tsconfig.json'), 'utf8')
);

const NATIVE_CI_STEPS = [
  { job: 'quality', command: 'npm run check:migration:types' },
  { job: 'browserless', command: 'npm run test:migration:rsd-selection' },
];

const unwired = (workflow) =>
  NATIVE_CI_STEPS.filter(
    ({ job, command }) => !runCommandsIn(jobBlock(workflow, job)).includes(command)
  );

describe('the native candidate checks run in CI', () => {
  it('runs the type check in Quality and the renderer tier in Browserless tests', () => {
    expect(unwired(testWorkflow)).toEqual([]);
  });

  it.each(NATIVE_CI_STEPS)('misses $command once only another job carries it', (step) => {
    const job = jobBlock(testWorkflow, step.job);
    const line = `run: ${step.command}`;
    const movedToAnotherJob =
      testWorkflow.replace(job, () => job.replace(line, 'run: echo moved')) +
      `\n  decoy:\n    steps:\n      - name: Decoy\n        ${line}\n`;

    expect(movedToAnotherJob).toContain(line);
    expect(unwired(movedToAnotherJob)).toEqual([step]);
  });

  it.each(NATIVE_CI_STEPS)('misses $command once it is commented out', (step) => {
    const job = jobBlock(testWorkflow, step.job);
    const line = `run: ${step.command}`;
    const commentedOut = testWorkflow.replace(job, () => job.replace(line, `# ${line}`));

    expect(unwired(commentedOut)).toEqual([step]);
  });

  it('runs on every pull request, whatever branch it targets or paths it touches', () => {
    expect(parse(testWorkflow).on.pull_request ?? {}).toEqual({});
  });
});

describe('the native candidate check scripts', () => {
  it("type-checks the candidate's own TypeScript project over all of its source", () => {
    expect(scripts['check:migration:types']).toBe(
      'tsc --noEmit -p experiments/native-architecture/tsconfig.json'
    );
    expect(nativeTsconfig.include).toEqual(['src/**/*.ts', 'src/**/*.tsx']);
  });

  it('runs the renderer tier through its own config after generating web/.svelte-kit', () => {
    expect(scripts['test:migration:rsd-selection']).toBe(
      'vitest run --config tools/migration/rsd-drawing-vitest.config.mjs'
    );
    expect(scripts['pretest:migration:rsd-selection']).toBe(
      'node tools/run-web-tool.mjs svelte-kit sync'
    );
  });
});
