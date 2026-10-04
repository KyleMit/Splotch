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

function runPreflight() {
  const lines = [];
  const passed = checkPreflight({
    config: readConfig({ BRANCH }),
    effects: {
      git: (...args) => spawnSync('git', args, { cwd: clone, encoding: 'utf8', env: fixture.env }),
      hasCommand: () => true,
      log: (line) => lines.push(line),
      runCmd: () => ({ status: 0, stdout: 'stub 1.0.0\n', stderr: '' }),
      shellOk: () => true,
    },
  });
  return { passed, lines };
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
      `${FAILED}origin unreachable — git ls-remote --exit-code origin exited 128`
    );
    expect(origin).toContain('does not appear to be a git repository');
  });

  it('passes a reachable origin and leaves both repositories as they were', () => {
    const before = { origin: refsIn(fixture.origin), clone: refsIn(clone) };

    const { passed, lines } = runPreflight();

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(`${PASSED}origin accepts a dry-run push to ${BRANCH}`);
    expect(refsIn(fixture.origin)).toBe(before.origin);
    expect(refsIn(clone)).toBe(before.clone);
    expect(fixture.sh(['status', '--porcelain'], { cwd: clone })).toBe('');
  });

  // A resumed run's branch is ahead of HEAD, and here origin has also moved it past the clone's
  // last fetch. A dry-run push from HEAD would be refused as a non-fast-forward, and one from the
  // stale refs/remotes/origin/<branch> as "fetch first".
  it("passes when origin's branch is ahead of HEAD and of this clone's last fetch", () => {
    const other = join(fixture.root, 'other');
    fixture.sh(['clone', '-q', fixture.origin, other], { cwd: fixture.root });
    fixture.sh(['switch', '-q', '-c', BRANCH], { cwd: other });
    const fetched = fixture.commit('first.md', 'one finding fixed\n', 'fix a finding', {
      cwd: other,
    });
    fixture.sh(['push', '-q', 'origin', BRANCH], { cwd: other });
    fixture.sh(['fetch', '-q', 'origin'], { cwd: clone });
    const tip = fixture.commit('second.md', 'another finding fixed\n', 'fix another finding', {
      cwd: other,
    });
    fixture.sh(['push', '-q', 'origin', BRANCH], { cwd: other });
    expect(fixture.sh(['rev-parse', `refs/remotes/origin/${BRANCH}`], { cwd: clone })).toBe(
      fetched
    );
    expect(fixture.sh(['rev-parse', `refs/heads/${BRANCH}`], { cwd: fixture.origin })).toBe(tip);
    const before = refsIn(fixture.origin);

    const { passed, lines } = runPreflight();

    expect(passed).toBe(true);
    expect(originLine(lines)).toBe(`${PASSED}origin accepts a dry-run push to ${BRANCH}`);
    expect(refsIn(fixture.origin)).toBe(before);
  });

  // remote.origin.receivepack names the program a push starts on origin's side. One that exits at
  // once stands in for credentials that may read origin but not push to it.
  it('fails when origin answers reads but refuses the push service', () => {
    fixture.sh(['config', 'remote.origin.receivepack', 'false'], { cwd: clone });

    const { passed, lines } = runPreflight();

    expect(passed).toBe(false);
    const origin = originLine(lines);
    expect(origin.split('\n', 1)[0]).toBe(
      `${FAILED}origin refuses a push to ${BRANCH} — git push --dry-run origin HEAD:refs/heads/${BRANCH} exited 128`
    );
    expect(origin).toContain('Could not read from remote repository');
  });
});
