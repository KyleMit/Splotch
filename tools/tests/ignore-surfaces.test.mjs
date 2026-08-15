// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A worktree-isolated agent leaves a full copy of the tree under .claude/worktrees/agent-*/.
// Four scanners walk the repo and each keeps its own ignore list in its own format, so the
// exclusion has to be written four times and cannot be imported from one constant. Prose
// asking the next reader to keep them aligned is what this repo calls a defect; this is the
// drift guard that replaces it. Dropping any one entry reds a gate only for a developer who
// has run such an agent — never on CI, which starts from a fresh checkout.
const repoRoot = join(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

// Matches the pattern only as a live entry: a commented-out or renamed line fails.
const listEntry = (pattern) => new RegExp(String.raw`^\s*${pattern}\s*$`, 'm');
const jsonEntry = (pattern) => new RegExp(String.raw`^\s*"${pattern}",?\s*$`, 'm');

describe('every repo scanner excludes worktree-isolated agent checkouts', () => {
  it('.gitignore excludes it', () => {
    expect(read('.gitignore')).toMatch(listEntry(String.raw`\.claude/worktrees/`));
  });

  it('.prettierignore excludes it', () => {
    expect(read('.prettierignore')).toMatch(listEntry(String.raw`\.claude/worktrees/`));
  });

  it('dprint.json excludes it', () => {
    expect(read('dprint.json')).toMatch(jsonEntry(String.raw`\.claude/worktrees/\*\*`));
  });

  // Imported rather than string-matched: ESLint's is the one surface that is executable
  // config, so the resolved array is available and is what the linter actually obeys.
  it('eslint.config.js excludes it', async () => {
    const { default: config } = await import('../../eslint.config.js');
    const ignores = config.flatMap((entry) => entry.ignores ?? []);
    expect(ignores).toContain('.claude/worktrees/');
  });
});
