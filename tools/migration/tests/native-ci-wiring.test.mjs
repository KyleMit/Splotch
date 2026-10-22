// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readNetlifyConfig } from '../../../e2e/server/netlifyConfig.ts';
import {
  jobBlock,
  runCommandsIn,
  testWorkflow,
} from '../../ci-mirror/tests/workflow-job-steps.mjs';

// Type checks, mounted renderer contracts and real-browser suites each need an explicit CI home.
// This guard pins both the command and the job rather than accepting a command in any job.
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const { scripts } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const nativeTsconfig = JSON.parse(readFileSync(join(repoRoot, 'tsconfig.json'), 'utf8'));

const NATIVE_CI_STEPS = [
  { job: 'quality', command: 'npm run check' },
  { job: 'browserless', command: 'npm run test:migration:rsd-selection' },
  {
    job: 'rn-web-e2e',
    command:
      'npm run test:e2e -- --project chromium --shard=${{ matrix.shard }}/${{ strategy.job-total }}',
  },
  { job: 'firefox-smoke', command: 'npm run test:firefox:smoke' },
  { job: 'webkit-smoke', command: 'npm run test:webkit:smoke' },
];

const unwired = (workflow) =>
  NATIVE_CI_STEPS.filter(
    ({ job, command }) => !runCommandsIn(jobBlock(workflow, job)).includes(command)
  );

describe('the native candidate checks run in CI', () => {
  it('runs the type check, the renderer tier, the RN web E2E shards and both engine smokes', () => {
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

// The RN web E2E jobs serve the export the Native web build job built from the deploy's install,
// never one of their own, and only an export at netlify.toml's publish directory is the one the
// suite's server (e2e/server/netlifySite.ts) serves.
const EXPORT_ARTIFACT = 'rn-web-export';
const EXPORT_SERVING_JOBS = ['rn-web-e2e', 'firefox-smoke', 'webkit-smoke'];
const { publish } = readNetlifyConfig(readFileSync(join(repoRoot, 'netlify.toml'), 'utf8'));
const workflowJobs = parse(testWorkflow).jobs;
const stepIndex = (steps, matches) => steps.findIndex(matches);
const exportStep = (step, action) =>
  step.uses?.startsWith(`actions/${action}-artifact@`) && step.with?.name === EXPORT_ARTIFACT;

describe('the RN web export the E2E jobs serve', () => {
  it("is uploaded from netlify.toml's publish directory after the production-install build", () => {
    const { steps } = workflowJobs['native-web-build'];
    const build = stepIndex(steps, (step) => step.run === 'npm run build:site');
    const upload = stepIndex(steps, (step) => exportStep(step, 'upload'));

    expect(build).toBeGreaterThanOrEqual(0);
    expect(upload).toBeGreaterThan(build);
    expect(steps[upload].with.path).toBe(`${publish}/`);
  });

  it.each(EXPORT_SERVING_JOBS)('%s downloads it into place and serves it unbuilt', (id) => {
    const { needs, steps } = workflowJobs[id];
    const download = stepIndex(steps, (step) => exportStep(step, 'download'));
    const run = stepIndex(steps, (step) => step.run?.startsWith('npm run test:'));

    expect(needs).toBe('native-web-build');
    expect(download).toBeGreaterThanOrEqual(0);
    expect(run).toBeGreaterThan(download);
    expect(steps[download].with.path).toBe(`${publish}/`);
    expect(steps[run].env?.SPLOTCH_E2E_PREBUILT).toBe(1);
  });
});

describe('the native candidate check scripts', () => {
  it('runs the RN web E2E suite from its own config', () => {
    expect(scripts['test:e2e']).toBe('playwright test --config e2e/playwright.config.ts');
  });

  it("type-checks the candidate's own TypeScript project over all of its source", () => {
    expect(scripts['check:migration:types']).toBe('tsc --noEmit -p tsconfig.json');
    expect(nativeTsconfig.include).toEqual(['src/**/*.ts', 'src/**/*.tsx']);
  });

  it('runs the renderer tier through its own framework-free config', () => {
    expect(scripts['test:migration:rsd-selection']).toBe(
      'vitest run --config tools/migration/rsd-drawing-vitest.config.mjs'
    );
    expect(scripts['pretest:migration:rsd-selection']).toBeUndefined();
    expect(scripts.check).toContain('npm run check:migration:types');
  });
});
