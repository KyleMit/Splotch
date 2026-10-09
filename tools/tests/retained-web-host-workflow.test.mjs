import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const workflow = parse(readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8'));
const job = workflow.jobs['retained-web-host-control'];
const CHILD_TIMEOUT_MS = 30_000;
const RETAINED_CONTROL_JOB_DEADLINE_MINUTES = 35;
const tempRoots = [];

function controlStep() {
  const step = job.steps.find(
    (entry) => entry.name === 'Build and check retained release and mechanism'
  );
  if (!step || typeof step.run !== 'string')
    throw new Error('Missing actual retained public-caller step');
  return step;
}

const NPM_STUB = `
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.TEST_CALLS, JSON.stringify(args) + '\\n');
const command = args[args.indexOf('run') + 1];
const flag = (name) => args.find((arg) => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
if (command === 'migration:web-host:build') {
  const root = join(flag('output-parent'), 'splotch-web-host-fixture-' + flag('artifact'));
  mkdirSync(root);
  for (let index = 0; index < Number(process.env.TEST_MARKERS); index++) console.log('Owned web-host artifact: ' + root);
  process.exit(Number(process.env.TEST_BUILD_EXIT));
} else if (command === 'show:free-port') {
  console.log('4193');
} else if (command === 'migration:web-host:check') {
  process.exit(Number(process.env.TEST_CHECK_EXIT));
} else if (command === 'migration:web-host:test') {
  process.exit(Number(process.env.TEST_BROWSER_EXIT));
} else {
  throw new Error('Unexpected npm command: ' + command);
}
`;

function runStep(script, { markers = 1, buildExit = 0, checkExit = 0, browserExit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-retained-ci-'));
  tempRoots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const calls = join(root, 'calls.jsonl');
  writeFileSync(calls, '');
  const stub = join(root, 'npm-stub.mjs');
  writeFileSync(stub, NPM_STUB);
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexec "$TEST_NODE" "$TEST_NPM_STUB" "$@"\n', {
    mode: 0o755,
  });
  const parent = join(root, 'artifact parent');
  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: CHILD_TIMEOUT_MS,
      env: {
        ...process.env,
        ...job.env,
        ARTIFACT_PARENT: parent,
        PATH: `${bin}:/usr/bin:/bin`,
        TEST_NODE: process.execPath,
        TEST_NPM_STUB: stub,
        TEST_CALLS: calls,
        TEST_MARKERS: String(markers),
        TEST_BUILD_EXIT: String(buildExit),
        TEST_CHECK_EXIT: String(checkExit),
        TEST_BROWSER_EXIT: String(browserExit),
      },
    }
  );
  return {
    result,
    parent,
    calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse),
  };
}

function commandNames(calls) {
  return calls.map((args) => args[args.indexOf('run') + 1]);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('retained host CI wiring', () => {
  it('uses an independent runner with full history and existing Node/pnpm/Chromium owners', () => {
    expect(job.name).toBe('Retained web host control');
    expect(job.if).toBe(workflow.jobs.test.if);
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(job.needs).toBeUndefined();
    expect(job.strategy).toBeUndefined();
    expect(job.steps.slice(0, 3).map((entry) => entry.uses)).toEqual([
      workflow.jobs.test.steps[0].uses,
      './.github/actions/setup-pnpm',
      './.github/actions/setup-playwright',
    ]);
    expect(job.steps[0].with).toEqual({ 'fetch-depth': 0, 'fetch-tags': true });
    expect(job.steps[1].with).toBeUndefined();
    expect(job.steps[2].with).toEqual({ browsers: 'chromium' });
    expect(Number.isInteger(job['timeout-minutes'])).toBe(true);
    expect(job['timeout-minutes']).toBe(RETAINED_CONTROL_JOB_DEADLINE_MINUTES);
    expect(job.env.TOPOLOGY_SHA).toBe('1b057679d5837b3c6e298fd8131203e51048d4f1');
    expect(job.env.TOPOLOGY_LOCK_SHA256).toBe(
      '9fed398b8fda5f309d40f35e7d65296bfc70bef356229ec5c44f144ffb0efd57'
    );
    expect(job.env.ARTIFACT_PARENT).toBeUndefined();
    expect(controlStep().env).toEqual({
      ARTIFACT_PARENT: '${{ runner.temp }}/retained-web-host',
    });
  });

  it('drives release then mechanism and repeats the mechanism browser caller', () => {
    const { result, parent, calls } = runStep(controlStep().run);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(commandNames(calls)).toEqual([
      'migration:web-host:build',
      'migration:web-host:check',
      'show:free-port',
      'migration:web-host:test',
      'migration:web-host:build',
      'migration:web-host:check',
      'show:free-port',
      'migration:web-host:test',
      'show:free-port',
      'migration:web-host:test',
    ]);
    for (const [index, artifact] of [
      [0, 'release'],
      [4, 'mechanism'],
    ]) {
      expect(calls[index]).toEqual([
        '--silent',
        'run',
        'migration:web-host:build',
        '--',
        `--topology-sha=${job.env.TOPOLOGY_SHA}`,
        `--topology-lock-sha256=${job.env.TOPOLOGY_LOCK_SHA256}`,
        `--artifact=${artifact}`,
        `--output-parent=${join(parent, artifact)}`,
      ]);
    }
    const browsers = calls.filter((args) => args.includes('migration:web-host:test'));
    expect(browsers).toHaveLength(3);
    expect(browsers.map((args) => args.find((arg) => arg.startsWith('--artifact-root=')))).toEqual([
      `--artifact-root=${join(parent, 'release', 'splotch-web-host-fixture-release')}`,
      `--artifact-root=${join(parent, 'mechanism', 'splotch-web-host-fixture-mechanism')}`,
      `--artifact-root=${join(parent, 'mechanism', 'splotch-web-host-fixture-mechanism')}`,
    ]);
    for (const args of browsers) {
      expect(args).toContain('--port=4193');
      expect(args).toContain(`--browser-registry=${process.env.HOME}/.cache/ms-playwright`);
    }
  });

  it('stops on the actual builder failure despite a printed root and successful tee', () => {
    const { result, calls } = runStep(controlStep().run, { buildExit: 23 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(commandNames(calls)).toEqual(['migration:web-host:build']);
  });

  it.each([0, 2])('refuses %i successful artifact-root markers before check/browser', (markers) => {
    const { result, calls } = runStep(controlStep().run, { markers });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Successful retained build must report exactly one artifact root'
    );
    expect(commandNames(calls)).toEqual(['migration:web-host:build']);
  });

  it('stops on the actual check failure before browser or mechanism work', () => {
    const { result, calls } = runStep(controlStep().run, { checkExit: 23 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(commandNames(calls)).toEqual(['migration:web-host:build', 'migration:web-host:check']);
  });

  it('stops on the actual browser failure before mechanism work', () => {
    const { result, calls } = runStep(controlStep().run, { browserExit: 23 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(23);
    expect(commandNames(calls)).toEqual([
      'migration:web-host:build',
      'migration:web-host:check',
      'show:free-port',
      'migration:web-host:test',
    ]);
  });

  it('proves swallowing the builder failure inverts the real refusal', () => {
    const script = controlStep().run.replace('| tee "$log"', '| tee "$log" || true');
    expect(script).not.toBe(controlStep().run);
    const { result, calls } = runStep(script, { buildExit: 23 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(commandNames(calls)).toHaveLength(10);
  });

  it.each(['release', 'mechanism'])(
    'configures always-upload for bounded %s evidence in a distinct artifact',
    (artifact) => {
      const step = job.steps.find((entry) => entry.name === `Upload retained ${artifact} evidence`);
      expect(step.if).toBe('${{ always() }}');
      expect(step.uses).toBe('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
      expect(step.with.name).toBe(`retained-web-host-${artifact}-\${{ github.run_attempt }}`);
      expect(step.with['include-hidden-files']).toBe(true);
      expect(step.with['if-no-files-found']).toBe('warn');
      const prefix = `\${{ runner.temp }}/retained-web-host/${artifact}/`;
      expect(step.with.path.trim().split('\n')).toEqual([
        `${prefix}*.log.txt`,
        `${prefix}splotch-web-host-*/*.json`,
        `${prefix}splotch-web-host-*/.splotch-web-host.json`,
        `${prefix}splotch-web-host-*/controls/**`,
        `${prefix}splotch-web-host-*/browser-results/**`,
        `${prefix}splotch-web-host-*/browser-report/**`,
      ]);
    }
  );
});
