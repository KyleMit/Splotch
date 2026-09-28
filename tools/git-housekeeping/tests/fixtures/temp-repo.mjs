// A throwaway repository with a bare `origin` and `origin/main`, so the
// merged-ness proofs run against real git rather than mocks. Identity and
// config are pinned to the fixture so a global commit.gpgsign or excludesFile
// on the host cannot change what the tests observe.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real-repository test pays for every git spawn that builds its scenario. The slowest,
// prune-local-branches' every-shape scenario at about 40 spawns, measured 4.4 s on a loaded
// local host against Vitest's 5 s default; whole files of these tests take at most 2.5 s on a
// CI runner. Every describe block that builds repositories takes these options.
const REAL_REPO_TEST_TIMEOUT_MS = 20_000;
export const REAL_REPO_TEST_OPTIONS = { timeout: REAL_REPO_TEST_TIMEOUT_MS };

export function createTempRepo() {
  const root = mkdtempSync(join(tmpdir(), 'git-housekeeping-'));
  const gitconfig = join(root, 'gitconfig');
  writeFileSync(gitconfig, '[init]\n\tdefaultBranch = main\n');
  const env = {
    ...process.env,
    HOME: root,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  const repo = join(root, 'repo');
  const origin = join(root, 'origin.git');

  function sh(args, { cwd = repo, extraEnv = {} } = {}) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, ...extraEnv },
    }).trim();
  }

  function commit(file, content, message, { cwd = repo, date } = {}) {
    mkdirSync(join(cwd, file, '..'), { recursive: true });
    writeFileSync(join(cwd, file), content);
    sh(['add', '-A'], { cwd });
    const extraEnv = date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {};
    sh(['commit', '-q', '-m', message], { cwd, extraEnv });
    return sh(['rev-parse', 'HEAD'], { cwd });
  }

  mkdirSync(repo);
  sh(['init', '-q', '--bare', origin], { cwd: root });
  sh(['init', '-q', '-b', 'main']);
  commit(
    '.gitignore',
    '/perf-profiles/*\n!/perf-profiles/evidence/\nnode_modules/\ntools/redteam/decrypted/\ntools/redteam/output/\n',
    'first'
  );
  sh(['remote', 'add', 'origin', origin]);
  sh(['push', '-q', '-u', 'origin', 'main']);

  return {
    root,
    repo,
    origin,
    env,
    sh,
    commit,
    pushMain: () => sh(['push', '-q', 'origin', 'main']),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
