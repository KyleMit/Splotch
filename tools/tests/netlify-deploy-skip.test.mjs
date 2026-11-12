import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs netlify.toml's real `ignore` command against a scratch history, so the
// shell quoting, the first-parent diff, and the pathspec semantics are all
// exercised the way Netlify's build shell runs them. Netlify reads the exit
// code: 0 skips the deploy, anything else builds. A real diff exits exactly 1,
// so a broken command (a git or shell error) cannot pass as a build.
const SKIP_EXIT = 0;
const BUILD_EXIT = 1;
const EXIT = { build: BUILD_EXIT, skip: SKIP_EXIT };

const repoRoot = join(import.meta.dirname, '..', '..');

function ignoreCommand() {
  const line = readFileSync(join(repoRoot, 'netlify.toml'), 'utf8')
    .split('\n')
    .find((text) => text.trimStart().startsWith('ignore ='));
  // A TOML literal string is its contents verbatim; no escape to decode.
  const match = line?.match(/^\s*ignore = '''(.*)'''$/);
  if (!match) throw new Error("netlify.toml's ignore command is not a one-line ''' literal string");
  return match[1];
}

let scratch;
let repo;
let env;
const refs = {};

function git(...args) {
  const result = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(name, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
  git('add', '-A');
  git('commit', '-q', '-m', name);
  refs[name] = git('rev-parse', 'HEAD');
}

// The host's git identity, signing, and hooks stay out of the fixture, as does
// any GIT_* variable inherited from an enclosing git process (a pre-push hook).
function isolatedGitEnv() {
  const gitconfig = join(scratch, 'gitconfig');
  writeFileSync(gitconfig, '[user]\n\tname = t\n\temail = t@t\n[commit]\n\tgpgsign = false\n');
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  return {
    ...inherited,
    HOME: scratch,
    XDG_CONFIG_HOME: scratch,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

// base ── pr            (feature branch: the tree a branch deploy builds)
//   ├──── merge         (main: --no-ff merge of pr, same tree as pr)
//   │       └ docsOnly ─ capabilityOnly ─ flatTool
//   └──── squash        (main, squash-merged instead: same tree as pr)
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'netlify-skip-'));
  repo = join(scratch, 'repo');
  mkdirSync(repo);
  env = isolatedGitEnv();
  git('init', '-q', '-b', 'main');
  commit('base', {
    'web/app.txt': '1',
    'docs/note.md': '1',
    'tools/flat.mjs': '1',
    'tools/capability/inner.mjs': '1',
  });
  git('checkout', '-q', '-b', 'feature');
  commit('pr', { 'web/app.txt': '2' });
  git('checkout', '-q', 'main');
  git('merge', '-q', '--no-ff', '-m', 'merge', 'feature');
  refs.merge = git('rev-parse', 'HEAD');
  commit('docsOnly', { 'docs/note.md': '2' });
  commit('capabilityOnly', { 'tools/capability/inner.mjs': '2' });
  commit('flatTool', { 'tools/flat.mjs': '2' });
  git('checkout', '-q', '-b', 'squash', refs.base);
  commit('squash', { 'web/app.txt': '2' });
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function runIgnore(cached, pushed) {
  return spawnSync('sh', ['-c', ignoreCommand()], {
    cwd: repo,
    env: { ...env, CACHED_COMMIT_REF: refs[cached], COMMIT_REF: refs[pushed] },
    encoding: 'utf8',
  });
}

describe('netlify deploy-skip command', () => {
  it('reproduces the trap: the merge has the tree a branch deploy already built', () => {
    expect(git('rev-parse', `${refs.pr}^{tree}`)).toBe(git('rev-parse', `${refs.merge}^{tree}`));
    expect(git('rev-parse', `${refs.pr}^{tree}`)).toBe(git('rev-parse', `${refs.squash}^{tree}`));
  });

  const cases = [
    {
      name: 'a merge whose tree a branch deploy built',
      cached: 'pr',
      pushed: 'merge',
      outcome: 'build',
    },
    {
      name: 'a squash merge whose tree a branch deploy built',
      cached: 'pr',
      pushed: 'squash',
      outcome: 'build',
    },
    {
      name: 'a rebuild of the commit already built',
      cached: 'merge',
      pushed: 'merge',
      outcome: 'build',
    },
    {
      name: 'a watched change since the last build',
      cached: 'base',
      pushed: 'pr',
      outcome: 'build',
    },
    {
      name: 'a flat tools/*.mjs entry point',
      cached: 'capabilityOnly',
      pushed: 'flatTool',
      outcome: 'build',
    },
    { name: 'a docs-only push', cached: 'merge', pushed: 'docsOnly', outcome: 'skip' },
    {
      name: 'a tools/ folder outside the watched set',
      cached: 'docsOnly',
      pushed: 'capabilityOnly',
      outcome: 'skip',
    },
  ];

  it.each(cases)('$outcome: $name', ({ cached, pushed, outcome }) => {
    const result = runIgnore(cached, pushed);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(EXIT[outcome]);
  });
});
