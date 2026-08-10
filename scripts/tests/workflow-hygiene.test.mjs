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
      const setupNode = actions.find(({ name }) => name === 'actions/setup-node');
      const nodeVersion = setupNode.lines
        .find((line) => /^\s+node-version:/.test(line))
        .split(':', 2)[1]
        .trim();
      expect(nodeVersion).toBe(floorMajor);
    });

    it('the Netlify build pins the engines floor major', () => {
      const netlifyToml = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8');
      expect(netlifyToml.match(/^\s*NODE_VERSION = "(\d+)"$/m)?.[1]).toBe(floorMajor);
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
