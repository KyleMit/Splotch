// Bootstraps the current checkout so the toolchain works immediately after `git worktree add`:
// copies the untracked files listed in .worktreeinclude from the main checkout, installs
// dependencies from the lockfile, and generates .svelte-kit types. Claude Code and the Codex
// desktop app both honor .worktreeinclude natively when they create managed worktrees, so this
// script reads the same file — one list, no drift — and its copy step degrades to a no-op there.
// Safe to re-run, and safe in the main checkout (no copy source, so only install + sync run).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { capture, isMain, ROOT, run, runMain } from './lib/proc.mjs';

const WORKTREE_INCLUDE_FILE = '.worktreeinclude';

export function parseWorktreeInclude(content) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function mainCheckoutRoot({ gitDir, gitCommonDir }) {
  if (resolve(gitDir) === resolve(gitCommonDir)) return null;
  return dirname(resolve(gitCommonDir));
}

export function planIncludeCopies({ entries, mainRoot, worktreeRoot, existsAt }) {
  return entries.map((entry) => {
    const from = join(mainRoot, entry);
    const to = join(worktreeRoot, entry);
    if (existsAt(to)) return { entry, action: 'kept-existing' };
    if (!existsAt(from)) return { entry, action: 'missing-source' };
    return { entry, action: 'copy', from, to };
  });
}

function copyWorktreeIncludes(worktreeRoot) {
  const gitDir = capture('git', ['rev-parse', '--absolute-git-dir'], { cwd: worktreeRoot }).trim();
  const gitCommonDir = capture('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: worktreeRoot,
  }).trim();
  const mainRoot = mainCheckoutRoot({ gitDir, gitCommonDir });
  if (!mainRoot) {
    console.log('worktree-setup: main checkout — nothing to copy');
    return;
  }
  const includeFile = join(worktreeRoot, WORKTREE_INCLUDE_FILE);
  const entries = existsSync(includeFile)
    ? parseWorktreeInclude(readFileSync(includeFile, 'utf8'))
    : [];
  for (const step of planIncludeCopies({
    entries,
    mainRoot,
    worktreeRoot,
    existsAt: existsSync,
  })) {
    if (step.action === 'copy') {
      mkdirSync(dirname(step.to), { recursive: true });
      copyFileSync(step.from, step.to);
      console.log(`worktree-setup: copied ${step.entry} from ${mainRoot}`);
    } else if (step.action === 'kept-existing') {
      console.log(`worktree-setup: ${step.entry} already present — left as-is`);
    } else {
      console.log(`worktree-setup: ${step.entry} not found in ${mainRoot} — skipped`);
    }
  }
}

export async function setupWorktree() {
  copyWorktreeIncludes(ROOT);
  run('npm', ['ci', '--prefer-offline'], { cwd: ROOT });
  run('node', [join('tools', 'web.mjs'), 'svelte-kit', 'sync'], { cwd: ROOT });
}

if (isMain(import.meta.url)) runMain(setupWorktree);
