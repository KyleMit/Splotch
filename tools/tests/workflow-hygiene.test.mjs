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

  for (const { name, lines } of [...workflows, ...actions]) {
    it(`${name} pins every external action to a 40-char SHA`, () => {
      for (const ref of usesRefs(lines)) {
        if (ref.startsWith('./')) continue;
        expect.soft(ref, `unpinned action "${ref}"`).toMatch(/@[0-9a-f]{40}$/);
      }
    });
  }
});
