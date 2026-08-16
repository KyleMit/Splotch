import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// pnpm owns the dependency tree (ADR-0119), but only *installing* moved — the
// `npm run <script>` graph works unchanged against a pnpm tree, so ADR-0019's
// vocabulary and every `npm run …` in the docs are still correct. That split is
// easy to get wrong in the harmless-looking direction: `npm install` here
// succeeds, produces a working flat node_modules, and silently writes a second
// lockfile that resolves independently of pnpm-lock.yaml and drifts from it.
// Nothing about the failure announces itself, which is why it is pinned here
// rather than left to prose.
const repoRoot = join(import.meta.dirname, '..', '..');

const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

/** Files that actually run an install, as opposed to documenting one. */
const INSTALL_SURFACE = [
  'netlify.toml',
  '.claude/hooks/session-start.sh',
  '.claude/cloud/setup.sh',
  '.codex/cloud/setup.sh',
  '.codex/cloud/maintenance.sh',
  '.codex/environments/environment.toml',
  'tools/bootstrap-codex-worktree.mjs',
  ...readdirSync(join(repoRoot, '.github', 'workflows')).map((f) => `.github/workflows/${f}`),
  ...readdirSync(join(repoRoot, '.github', 'actions')).map(
    (d) => `.github/actions/${d}/action.yml`
  ),
];

// A global CLI install is a different act — it puts a tool on PATH and says
// nothing about who owns this repo's node_modules.
const GLOBAL_INSTALL = /\s(-g|--global)\b/;

/** Executable lines only: `#` opens a comment in every format scanned here. */
function commandLines(file) {
  return readFileSync(join(repoRoot, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'));
}

describe('package manager', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

  // pnpm/action-setup in CI and `corepack install` in the cloud bootstrap both
  // read this one field, so an exact version here is what stops three
  // environments from resolving three different pnpm majors.
  it('pins an exact pnpm version in packageManager', () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/);
  });

  it('tracks pnpm-lock.yaml as the only lockfile', () => {
    expect(git(['ls-files', 'pnpm-lock.yaml'])).toBe('pnpm-lock.yaml');
    expect(git(['ls-files', 'package-lock.json'])).toBe('');
  });

  // The backstop for the mistake itself: an `npm install` someone runs by habit
  // leaves an ignored file behind instead of a committable one.
  it('cannot commit a package-lock.json', () => {
    const ignored = spawnSync('git', ['check-ignore', '-q', 'package-lock.json'], {
      cwd: repoRoot,
    });
    expect(ignored.status).toBe(0);
  });

  describe.each(INSTALL_SURFACE)('%s', (file) => {
    it('installs with pnpm, never npm', () => {
      const offenders = commandLines(file).filter(
        (line) => /\bnpm (install|ci)\b/.test(line) && !GLOBAL_INSTALL.test(line)
      );
      expect(offenders).toEqual([]);
    });
  });

  it('leaves the npm run script graph alone', () => {
    const runsScripts = Object.values(pkg.scripts).some((body) => body.includes('npm run '));
    expect(runsScripts).toBe(true);
  });
});
