// Preflight's origin check against real git: a bare origin and a clone holding every file
// preflight reads, with the runner binary, auth, and build probes stubbed to pass. The passing
// cases show everything else passes, so a failed run below is the origin check's alone. A clone
// carries refs/remotes/origin/HEAD, so a check that trusts that ref instead of contacting origin
// passes the first case.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTempRepo,
  REAL_REPO_TEST_OPTIONS,
} from '../../git-housekeeping/tests/fixtures/temp-repo.mjs';
import { checkPreflight } from '../check-preflight.mjs';
import { readConfig } from '../lib/burndown-config.mjs';
import { PROMPTS } from '../lib/burndown-core.mjs';

const BRANCH = 'audit/burndown';
const PASSED = '  \x1b[32m✓\x1b[0m ';
const FAILED = '  \x1b[31m✗\x1b[0m ';
const ACCEPTED = `${PASSED}origin accepts a dry-run push to ${BRANCH}`;

let fixture;
let clone;
let originalCwd;

// The files preflight reads from the checkout, committed so the clone starts clean.
function commitRunInputs() {
  const files = {
    '.gitignore': '.audit-work/\n',
    'docs/AUDIT.md':
      '# Audit\n\n## Source: Code audit\n\n### [P1][bug] A finding\n\nIt is wrong.\n',
    ...Object.fromEntries(
      ['verifier', 'implementer', 'reviewer'].map((role) => [
        join(PROMPTS, `${role}.md`),
        `# ${role}\n`,
      ])
    ),
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(fixture.repo, path, '..'), { recursive: true });
    writeFileSync(join(fixture.repo, path), content);
  }
  fixture.sh(['add', '-A']);
  fixture.sh(['commit', '-q', '-m', 'stage run inputs']);
  fixture.pushMain();
}

// Another checkout that pushes the run's branch to origin, as an earlier run does. Returns a
// function that commits one file there, pushes, and returns the new tip.
function createBranchPusher() {
  const other = join(fixture.root, 'other');
  fixture.sh(['clone', '-q', fixture.origin, other], { cwd: fixture.root });
  fixture.sh(['switch', '-q', '-c', BRANCH], { cwd: other });
  return (file) => {
    const tip = fixture.commit(file, `${file}\n`, `fix ${file}`, { cwd: other });
    fixture.sh(['push', '-q', 'origin', BRANCH], { cwd: other });
    return tip;
  };
}

// `afterListing` runs once origin has answered `ls-remote`, so a case can move origin between
// the listing and the push probe.
function runPreflight({ afterListing = () => {} } = {}) {
  const lines = [];
  const gitCalls = [];
  const passed = checkPreflight({
    config: readConfig({ BRANCH }),
    effects: {
      git: (...args) => {
        gitCalls.push(args);
        const result = spawnSync('git', args, { cwd: clone, encoding: 'utf8', env: fixture.env });
        if (args[0] === 'ls-remote') afterListing();
        return result;
      },
      hasCommand: () => true,
      log: (line) => lines.push(line),
      runCmd: () => ({ status: 0, stdout: 'stub 1.0.0\n', stderr: '' }),
      shellOk: () => true,
    },
  });
  return { passed, lines, gitCalls };
}

const originLine = (lines) => lines.find((line) => /^ {2}\S+ origin /.test(line));
const refsIn = (dir) =>
  fixture.sh(['for-each-ref', '--format=%(objectname) %(refname)'], { cwd: dir });

describe('the origin check', REAL_REPO_TEST_OPTIONS, () => {
  beforeEach(() => {
    fixture = createTempRepo();
    commitRunInputs();
    clone = join(fixture.root, 'clone');
    fixture.sh(['clone', '-q', fixture.origin, clone], { cwd: fixture.root });
    originalCwd = process.cwd();
    process.chdir(clone);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fixture.cleanup();
  });

  it('fails when origin is gone, though the clone still has refs/remotes/origin/HEAD', () => {
    expect(fixture.sh(['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: clone })).toBe(
      'refs/remotes/origin/main'
    );
    rmSync(fixture.origin, { recursive: true, force: true });

    const { passed, lines } = runPreflight();

    expect(passed).toBe(false);
    const origin = originLine(lines);
    expect(origin.split('\n', 1)[0]).toBe(
      `${FAILED}origin unreachable — git ls-remote origin exited 128`
    );
    expect(origin).toContain('does not appear to be a git repository');
  });

  it('passes a reachable origin and leaves both repositories as they were', () => {
    const before = { origin: refsIn(fixture.origin), clone: refsIn(clone) };

    const { passed, lines } = runPreflight();

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(ACCEPTED);
    expect(refsIn(fixture.origin)).toBe(before.origin);
    expect(refsIn(clone)).toBe(before.clone);
    expect(fixture.sh(['status', '--porcelain'], { cwd: clone })).toBe('');
  });

  // A resumed run's branch is ahead of HEAD, and here origin has also moved it past the clone's
  // last fetch. The probe re-pushes origin's own tip rather than HEAD or the stale fetch, so the
  // same command without --dry-run would change nothing.
  it("passes when origin's branch is ahead of HEAD and of this clone's last fetch", () => {
    const pushFix = createBranchPusher();
    const fetched = pushFix('first.md');
    fixture.sh(['fetch', '-q', 'origin'], { cwd: clone });
    const tip = pushFix('second.md');
    expect(fixture.sh(['rev-parse', `refs/remotes/origin/${BRANCH}`], { cwd: clone })).toBe(
      fetched
    );
    expect(fixture.sh(['rev-parse', `refs/heads/${BRANCH}`], { cwd: fixture.origin })).toBe(tip);
    const before = refsIn(fixture.origin);

    const { passed, lines, gitCalls } = runPreflight();

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(ACCEPTED);
    expect(gitCalls).toContainEqual([
      'push',
      '--dry-run',
      '--force',
      'origin',
      `${tip}:refs/heads/${BRANCH}`,
    ]);
    expect(refsIn(fixture.origin)).toBe(before);
  });

  it("passes when origin's branch moves between the listing and the push probe", () => {
    const pushFix = createBranchPusher();
    pushFix('first.md');
    let before;

    const { passed, lines } = runPreflight({
      afterListing: () => {
        pushFix('second.md');
        before = refsIn(fixture.origin);
      },
    });

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(ACCEPTED);
    expect(refsIn(fixture.origin)).toBe(before);
  });

  // A push URL whose copy of the branch lags the fetch side, as a fork behind its upstream does.
  // The run fetches from one and fast-forwards the other, so the lag is no reason to refuse.
  it('passes when the push URL holds an older tip of the branch than the listing shows', () => {
    const pushFix = createBranchPusher();
    pushFix('first.md');
    const pushSide = join(fixture.root, 'push-side.git');
    fixture.sh(['clone', '-q', '--bare', fixture.origin, pushSide], { cwd: fixture.root });
    fixture.sh(['fetch', '-q', 'origin'], { cwd: clone });
    pushFix('second.md');
    fixture.sh(['config', 'remote.origin.pushurl', pushSide], { cwd: clone });
    const before = { origin: refsIn(fixture.origin), pushSide: refsIn(pushSide) };

    const { passed, lines } = runPreflight();

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(ACCEPTED);
    expect(refsIn(fixture.origin)).toBe(before.origin);
    expect(refsIn(pushSide)).toBe(before.pushSide);
  });

  it('passes an origin that has no refs yet, and creates none there', () => {
    const empty = join(fixture.root, 'empty.git');
    fixture.sh(['init', '-q', '--bare', empty], { cwd: fixture.root });
    fixture.sh(['remote', 'set-url', 'origin', empty], { cwd: clone });

    const { passed, lines } = runPreflight();

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(ACCEPTED);
    expect(refsIn(empty)).toBe('');
  });

  // remote.origin.receivepack names the program a push starts on origin's side. One that exits at
  // once stands in for credentials that may read origin but not push to it.
  it('fails when origin answers reads but refuses the push service', () => {
    fixture.sh(['config', 'remote.origin.receivepack', 'false'], { cwd: clone });

    const { passed, lines } = runPreflight();

    expect(passed).toBe(false);
    const origin = originLine(lines);
    expect(origin.split('\n', 1)[0]).toBe(
      `${FAILED}origin refuses a push to ${BRANCH} — git push --dry-run --force origin HEAD:refs/heads/${BRANCH} exited 128`
    );
    expect(origin).toContain('Could not read from remote repository');
  });
});
