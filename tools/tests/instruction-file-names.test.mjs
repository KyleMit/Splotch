import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// On a case-insensitive filesystem, which is macOS's default, a tracked file
// whose name differs from an agent instruction file's only by case is that
// instruction file. A `docs/CLOUD/Claude.md` opens as `docs/CLOUD/CLAUDE.md`, so
// Claude Code injects the whole file as nested project instructions into any
// local session that reads a file in `docs/CLOUD/`, a cost no CI run shows:
// Linux is case-sensitive, and Ruler matches the names exactly. This guard
// reads the spellings git tracks instead.
const repoRoot = join(import.meta.dirname, '..', '..');

const INSTRUCTION_FILE_NAMES = ['CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md'];

// Raised past execFileSync's 1 MB default, which a whole-tree listing can
// reach; the cap only stops a runaway.
const TRACKED_LISTING_MAX_BYTES = 64 * 1024 * 1024;

const CASE_COLLISION_MESSAGE =
  'On a case-insensitive filesystem (macOS by default) each of these paths also opens as CLAUDE.md, AGENTS.md, or CLAUDE.local.md, so Claude Code or Codex loads it as nested agent instructions for a session working in that directory. Rename each so its lowercased name matches no instruction file.';

function caseCollidingInstructionFiles(paths) {
  return paths.filter((path) => {
    const name = basename(path);
    return INSTRUCTION_FILE_NAMES.some(
      (instructionName) =>
        name !== instructionName && name.toLowerCase() === instructionName.toLowerCase()
    );
  });
}

function trackedPaths() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: TRACKED_LISTING_MAX_BYTES,
  })
    .split('\0')
    .filter(Boolean);
}

describe('agent instruction file names', () => {
  it('flags a name that matches an instruction file only case-insensitively', () => {
    expect(
      caseCollidingInstructionFiles([
        'CLAUDE.md',
        'web/src/AGENTS.md',
        'docs/X/Claude.md',
        'a/Agents.md',
        'b/claude.local.md',
        'c/CLAUDE.local.md',
        'd/claude.mdx',
      ])
    ).toEqual(['docs/X/Claude.md', 'a/Agents.md', 'b/claude.local.md']);
  });

  it('tracks no file that a case-insensitive filesystem opens as an instruction file', () => {
    const tracked = trackedPaths();
    expect(tracked).toEqual(expect.arrayContaining(['CLAUDE.md', 'AGENTS.md']));
    expect(caseCollidingInstructionFiles(tracked), CASE_COLLISION_MESSAGE).toEqual([]);
  });
});
