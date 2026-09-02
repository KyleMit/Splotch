import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shouldWriteBlobsProbe } from '../api-smoke/lib/deployed-admin-target.mjs';

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
const setupPnpmAction = actions.find(({ name }) => name === 'actions/setup-pnpm');
const installMaestroAction = actions.find(({ name }) => name === 'actions/install-maestro');
const installMaestroRunIndex = installMaestroAction.lines.findIndex(
  (line) => line === '      run: |'
);
const installMaestroScript = installMaestroAction.lines
  .slice(installMaestroRunIndex + 1)
  .map((line) => line.slice(8))
  .join('\n');
const maestroVersion = installMaestroAction.lines
  .find((line) => /^\s+MAESTRO_VERSION:/.test(line))
  .split(':', 2)[1]
  .trim();
const tempRoots = [];

function writeExecutable(path, body) {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function runInstallMaestro(versionOutput) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-install-maestro-'));
  tempRoots.push(root);
  const home = join(root, 'home');
  const stubBin = join(root, 'bin');
  const maestroStub = join(root, 'maestro');
  const githubPath = join(root, 'github-path');
  mkdirSync(stubBin);
  writeExecutable(
    join(stubBin, 'curl'),
    `printf '%s\\n' 'mkdir -p "$HOME/.maestro/bin"' 'cp "$FAKE_MAESTRO_SOURCE" "$HOME/.maestro/bin/maestro"'`
  );
  writeExecutable(maestroStub, `printf '%s\\n' "$FAKE_MAESTRO_VERSION_OUTPUT"`);

  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', installMaestroScript],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_MAESTRO_SOURCE: maestroStub,
        FAKE_MAESTRO_VERSION_OUTPUT: versionOutput,
        GITHUB_PATH: githubPath,
        HOME: home,
        MAESTRO_VERSION: maestroVersion,
        PATH: `${stubBin}:/usr/bin:/bin`,
      },
    }
  );

  return { githubPath, home, result };
}

function stepScript(lines, stepName) {
  const start = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  if (start < 0) return undefined;
  const runIndex = lines.findIndex((line, index) => index > start && /^\s+run: \|\s*$/.test(line));
  if (runIndex < 0) return undefined;

  const scriptIndent = lines[runIndex].search(/\S/) + 2;
  const script = [];
  for (const line of lines.slice(runIndex + 1)) {
    if (line.trim() !== '' && line.search(/\S/) < scriptIndent) break;
    script.push(line.slice(scriptIndent));
  }
  return script.join('\n');
}

// The stub resolves --body-file the way gh does and captures the bytes from
// that exact path, so the body assertions describe what gh was handed rather
// than whatever the step happened to leave in RUNNER_TEMP. Reading the
// directory instead lets a step that names a missing or wrong file still
// satisfy every assertion, while real gh would exit non-zero and the
// unattended gate would file nothing.
const GH_STUB = [
  `printf '%s\\n' "$*" >>"$GH_CALL_LOG"`,
  'if [[ "$1" == issue && "$2" == list ]]; then',
  '  printf %s "$GH_EXISTING_ISSUE"',
  '  exit 0',
  'fi',
  'body_file=""',
  'awaiting=0',
  'for arg in "$@"; do',
  '  if [[ $awaiting == 1 ]]; then body_file="$arg"; awaiting=0; continue; fi',
  '  case "$arg" in',
  '    --body-file) awaiting=1 ;;',
  '    --body-file=*) body_file="${arg#--body-file=}" ;;',
  '  esac',
  'done',
  'if [[ $awaiting == 1 || -z "$body_file" ]]; then',
  '  echo "gh: --body-file needs a value" >&2',
  '  exit 1',
  'fi',
  'if [[ ! -r "$body_file" ]]; then',
  '  echo "gh: cannot read $body_file" >&2',
  '  exit 1',
  'fi',
  'cat "$body_file" >"$GH_BODY_CAPTURE"',
].join('\n');

function runFilingStep(script, stepEnv, existingIssue) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-gate-filing-'));
  tempRoots.push(root);
  const stubBin = join(root, 'bin');
  const runnerTemp = join(root, 'runner-temp');
  const ghCallLog = join(root, 'gh-calls.log');
  const ghBodyCapture = join(root, 'gh-body-capture.md');
  mkdirSync(stubBin);
  mkdirSync(runnerTemp);
  writeFileSync(ghCallLog, '');
  writeFileSync(ghBodyCapture, '');
  writeExecutable(join(stubBin, 'gh'), GH_STUB);

  const result = spawnSync(
    '/bin/bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
    {
      encoding: 'utf8',
      env: {
        ...stepEnv,
        GH_BODY_CAPTURE: ghBodyCapture,
        GH_CALL_LOG: ghCallLog,
        GH_EXISTING_ISSUE: existingIssue,
        PATH: `${stubBin}:/usr/bin:/bin`,
        RUNNER_TEMP: runnerTemp,
      },
    }
  );

  return {
    body: readFileSync(ghBodyCapture, 'utf8'),
    ghCalls: readFileSync(ghCallLog, 'utf8'),
    result,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

function timeoutMinutesAtIndent(line, indent) {
  return line.match(new RegExp(`^ {${indent}}timeout-minutes:\\s*(\\d+)`))?.[1];
}

describe('workflow hygiene', () => {
  it('found the workflows and composite actions', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(7);
    expect(actions.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['plain', '    timeout-minutes: 2', '2'],
    ['trailing whitespace', '    timeout-minutes: 5  ', '5'],
    ['inline comment', '    timeout-minutes: 2 # bounds execution only', '2'],
  ])('parses a %s job timeout', (_label, line, expected) => {
    expect(timeoutMinutesAtIndent(line, 4)).toBe(expected);
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

      it('keeps every step timeout shorter than its job timeout', () => {
        for (const job of jobs(lines)) {
          const jobTimeout = job.lines
            .map((line) => timeoutMinutesAtIndent(line, 4))
            .find((timeout) => timeout !== undefined);
          if (jobTimeout === undefined) continue;

          const stepTimeouts = job.lines
            .map((line) => timeoutMinutesAtIndent(line, 8))
            .filter((timeout) => timeout !== undefined);
          for (const stepTimeout of stepTimeouts) {
            expect
              .soft(
                Number(stepTimeout),
                `job "${job.id}" has a step timeout that cannot fire before the job timeout`
              )
              .toBeLessThan(Number(jobTimeout));
          }
        }
      });
    });
  }

  describe('actions/install-maestro', () => {
    it('checks the installed binary and exports its directory', () => {
      const { githubPath, home, result } = runInstallMaestro(maestroVersion);

      expect(result.status).toBe(0);
      expect(readFileSync(githubPath, 'utf8')).toBe(`${join(home, '.maestro', 'bin')}\n`);
    });

    it.each([
      ['substring version', `1${maestroVersion}`],
      ['prerelease version', `${maestroVersion}-dev.1`],
      [
        'update notice containing the pin',
        `A new version ${maestroVersion} is available\n1${maestroVersion}`,
      ],
    ])('rejects a mismatched %s', (_label, versionOutput) => {
      const { result } = runInstallMaestro(versionOutput);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `does not match requested version '${maestroVersion}'. Output: ${versionOutput}`
      );
    });
  });

  // CI and the Netlify build install the newest release of the engines floor
  // major, so the oldest line the repo promises to support is the one green CI
  // and the deploy actually exercise — a newer major would hide floor-only
  // breakage until deploy time.
  describe('Node version policy', () => {
    const enginesNode = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).engines
      .node;
    const floorMajor = enginesNode.match(/^>=(\d+)(?:\.\d+)?$/)?.[1];

    it('declares the engines floor as >=major[.minor]', () => {
      expect(floorMajor).toBeDefined();
    });

    it('CI installs the engines floor major', () => {
      const runtimeMajor = setupPnpmAction.lines
        .find((line) => /^\s+runtime:\s*node@/.test(line))
        ?.match(/node@(\d+)$/)?.[1];
      expect(runtimeMajor).toBe(floorMajor);
    });

    it('keeps Node setup active when the hosted deploy smoke skips dependencies', () => {
      const blobsSmoke = workflows.find(({ name }) => name === 'blobs-smoke.yml');

      expect(setupPnpmAction.lines.some((line) => /^\s+if:/.test(line))).toBe(false);
      expect(blobsSmoke.lines).toContain('      - uses: ./.github/actions/setup-pnpm');
      expect(blobsSmoke.lines).toContain("          install: 'false'");
    });

    it('runs the automatic hosted deploy smoke only on its production schedule', () => {
      const blobsSmoke = workflows.find(({ name }) => name === 'blobs-smoke.yml');

      expect(blobsSmoke.lines).not.toContain('  deployment_status:');
      expect(blobsSmoke.lines).toContain(
        "          DEPLOY_SMOKE_URL: ${{ github.event.inputs.url || 'https://splotch.art' }}"
      );
      expect(blobsSmoke.lines).toContain('        required: false');
      expect(blobsSmoke.lines).toContain('  group: hosted-deploy-smoke');
      expect(blobsSmoke.lines).toContain('          fetch-depth: 0');
      expect(blobsSmoke.lines).toContain(
        "          DEPLOY_SMOKE_REQUIRE_CURRENT_VERSION: ${{ github.event.inputs.url && github.event.inputs.url != 'https://splotch.art' && github.event.inputs.url != 'https://splotch.art/' && 'true' || 'false' }}"
      );
      expect(blobsSmoke.lines).toContain(
        '        run: node --experimental-strip-types --disable-warning=ExperimentalWarning tools/api-smoke/check-deployed-contract.mjs'
      );
      expect(blobsSmoke.lines.join('\n')).not.toContain('deployment_status.environment_url');
    });

    it('keeps automated production Blobs checks on the read-only contract', () => {
      const blobsSmoke = workflows.find(({ name }) => name === 'blobs-smoke.yml');
      const defaultTarget = blobsSmoke.lines
        .find((line) => line.includes('DEPLOY_SMOKE_URL:'))
        ?.match(/\|\| '([^']+)'/)?.[1];

      expect(defaultTarget).toBeDefined();
      expect(shouldWriteBlobsProbe(defaultTarget)).toBe(false);
    });

    it.each([
      ['canonical production', 'https://splotch.art', false],
      ['production with a path', 'https://splotch.art/admin', false],
      ['production www alias', 'https://www.splotch.art', false],
      ['production Netlify alias', 'https://splotchy.netlify.app', false],
      ['unknown remote host', 'https://example.com', false],
      ['insecure remote preview', 'http://feature--splotchy.netlify.app', false],
      ['deploy preview', 'https://deploy-preview-1104--splotchy.netlify.app', true],
      ['branch preview', 'https://feature--splotchy.netlify.app', true],
      ['IPv4 loopback fixture', 'http://127.0.0.1:4173', true],
      ['IPv6 loopback fixture', 'http://[::1]:4173', true],
      ['localhost fixture', 'http://localhost:4173', true],
    ])('classifies the %s target for Blobs writes', (_label, target, expected) => {
      expect(shouldWriteBlobsProbe(target)).toBe(expected);
    });

    it('the Netlify build pins the engines floor major', () => {
      const netlifyToml = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8');
      expect(netlifyToml.match(/^\s*NODE_VERSION = "(\d+)"$/m)?.[1]).toBe(floorMajor);
    });

    it('the Codex environment guide names the engines floor major', () => {
      const codexGuide = readFileSync(join(repoRoot, 'docs/CLOUD/Codex.md'), 'utf8');
      expect(codexGuide.match(/latest available Node (\d+) patch/)?.[1]).toBe(floorMajor);
    });
  });

  // The Playwright cache keys embed the literal `browsers` input, so a browser
  // set installed by test.yml but absent from the warming matrix silently
  // misses the warmed default-branch entries while both workflows stay green.
  // The two YAML values cannot share a constant; this is their drift guard.
  describe('Playwright cache warming', () => {
    it('warms exactly the browser sets the Tests workflow installs', () => {
      const testsWorkflow = workflows.find(({ name }) => name === 'test.yml');
      const callerBrowsers = [];
      testsWorkflow.lines.forEach((line, index) => {
        if (!/^\s*-\s+uses: \.\/\.github\/actions\/setup-playwright$/.test(line)) return;
        const browsers = testsWorkflow.lines
          .slice(index + 1, index + 4)
          .map((withLine) => withLine.match(/^\s+browsers:\s*(\S.*?)\s*$/)?.[1])
          .find((value) => value !== undefined);
        expect(
          browsers,
          `setup-playwright caller near test.yml line ${index + 1} has no browsers input`
        ).toBeDefined();
        callerBrowsers.push(browsers);
      });
      expect(callerBrowsers.length).toBeGreaterThan(0);

      const warmWorkflow = workflows.find(({ name }) => name === 'warm-playwright-cache.yml');
      const matrix = warmWorkflow.lines
        .find((line) => /^\s+browsers: \[/.test(line))
        .match(/\[(.*)\]/)[1]
        .split(',')
        .map((entry) => entry.trim());

      expect(new Set(matrix)).toEqual(new Set(callerBrowsers));
    });
  });

  describe('Playwright e2e sharding', () => {
    it('keeps the job total equal to the contiguous shard axis', () => {
      const testsWorkflow = workflows.find(({ name }) => name === 'test.yml');
      const testJob = jobs(testsWorkflow.lines).find(({ id }) => id === 'test');
      const matrixStart = testJob.lines.findIndex((line) => line === '      matrix:');
      expect(matrixStart).toBeGreaterThanOrEqual(0);

      const matrixLines = [];
      for (const line of testJob.lines.slice(matrixStart + 1)) {
        if (/^ {8}/.test(line)) matrixLines.push(line);
        else if (line.trim() !== '') break;
      }
      const axes = matrixLines
        .map((line) => line.match(/^ {8}([\w-]+):/)?.[1])
        .filter((axis) => axis !== undefined);
      const shardLine = matrixLines.find((line) => /^ {8}shard: \[/.test(line));
      expect(shardLine).toBeDefined();
      const shardValues = shardLine
        .match(/\[(.*)\]/)[1]
        .split(',')
        .map((value) => Number(value.trim()));
      const jobText = testJob.lines.join('\n');

      expect(axes).toEqual(['shard']);
      expect(shardValues).toEqual(
        Array.from({ length: shardValues.length }, (_, index) => index + 1)
      );
      expect(jobText).toContain('name: Tests (${{ matrix.shard }}/${{ strategy.job-total }})');
      expect(jobText).toContain('--shard=${{ matrix.shard }}/${{ strategy.job-total }}');
    });
  });

  // These steps run only when a gate has already gone red, so a broken one is
  // invisible until the moment it is the only thing reporting. Executing them
  // against a stub gh is the difference between "the YAML looks right" and
  // "the issue gets filed" — the shell has been wrong here while the YAML was
  // fine. Reading the body from a variable is what made it wrong: a heredoc
  // inside "$(...)" leaves bash scanning for the closing paren, and an
  // apostrophe in the prose ends the scan early.
  const filingSteps = [
    {
      // The apostrophe excerpt is the regression guard, not decoration: it is
      // the character that broke this step when the body came from a variable.
      body: ["scenario's", 'ADR-0140', 'multi-finger:breach'],
      env: {
        COMPARE_OUTCOME: 'success',
        GITHUB_SHA: 'e4cb7451e0aa0dcd5e0f2c9e0b3b5c8ea1f2d3c4',
        REPRODUCED: 'multi-finger:breach',
        RUN_URL: 'https://github.com/KyleMit/Splotch/actions/runs/1',
      },
      label: 'area:ci-testing',
      title: 'WebKit commit gate failed on main',
      workflow: 'test.yml',
    },
    {
      body: ['maestro-report-api-<API>', 'launch-smoke matrix leg'],
      env: {
        BUILD_RESULT: 'success',
        GITHUB_REF_NAME: 'v1.5.0',
        PLATFORM: 'Android',
        RUN_URL: 'https://github.com/KyleMit/Splotch/actions/runs/2',
        SMOKE_RESULT: 'failure',
      },
      label: 'area:native',
      title: 'Android native deploy gate failed',
      workflow: 'android-deploy.yml',
    },
    {
      body: ['maestro-ios-report', 'did not boot and paint'],
      env: {
        ARTIFACT: 'maestro-ios-report',
        GITHUB_REF_NAME: 'v1.5.0',
        PLATFORM: 'iOS',
        REPORT_OUTCOME: 'success',
        RUN_URL: 'https://github.com/KyleMit/Splotch/actions/runs/3',
        SMOKE_OUTCOME: 'failure',
      },
      label: 'area:native',
      title: 'iOS native deploy gate failed',
      workflow: 'ios-deploy.yml',
    },
  ];

  describe.each(filingSteps)('$workflow files its gate failure', (step) => {
    const script = stepScript(
      workflows.find(({ name }) => name === step.workflow).lines,
      'File the failure'
    );

    it('has a File the failure step carrying a shell script', () => {
      expect(script).toBeTruthy();
    });

    it('opens one issue when none is already tracking the gate', () => {
      const { body, ghCalls, result } = runFilingStep(script, step.env, '');

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(ghCalls).toContain(`issue create --title ${step.title}`);
      expect(ghCalls).toContain(`--label type:bug --label ${step.label} --body-file`);
      expect(ghCalls).not.toContain('issue comment');
      for (const excerpt of step.body) expect(body).toContain(excerpt);
      expect(body).toContain(step.env.RUN_URL);
    });

    it('comments on the open issue instead of opening a second one', () => {
      const { body, ghCalls, result } = runFilingStep(script, step.env, '41');

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(ghCalls).toContain('issue comment 41 --body-file');
      expect(ghCalls).not.toContain('issue create');
      for (const excerpt of step.body) expect(body).toContain(excerpt);
    });
  });

  // The fail-closed arm of the same step. A comparison that could not run still
  // files — otherwise a reporter crash on top of a real breach leaves a red main
  // with nothing filed (the PR 1573 review) — but the issue has to say that is
  // what happened, or the reader takes an unverified failure for a confirmed
  // regression.
  it('says so when it files because the comparison could not be run', () => {
    const script = stepScript(
      workflows.find(({ name }) => name === 'test.yml').lines,
      'File the failure'
    );
    const { body, result } = runFilingStep(
      script,
      {
        COMPARE_OUTCOME: 'failure',
        GITHUB_SHA: 'e4cb7451e0aa0dcd5e0f2c9e0b3b5c8ea1f2d3c4',
        REPRODUCED: '',
        RUN_URL: 'https://github.com/KyleMit/Splotch/actions/runs/1',
      },
      ''
    );

    expect(result.status).toBe(0);
    expect(body).toContain('filed fail-closed');
    expect(body).not.toContain('in the same way');
  });

  // Locks the harness itself. If the stub stops resolving --body-file, every
  // case above keeps passing against a step that names a file gh cannot read.
  it.each([
    ['a path it cannot read', 'gh issue create --title T --body-file /nonexistent/gate-body.md'],
    ['no value at all', 'gh issue create --title T --body-file'],
  ])('fails a filing step that hands gh %s', (_label, script) => {
    const { result } = runFilingStep(script, {}, '');

    expect(result.status).not.toBe(0);
  });

  for (const { name, lines } of workflows) {
    it(`${name} keeps issue bodies out of a command substitution`, () => {
      expect(lines.join('\n')).not.toContain('="$(cat <<');
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
