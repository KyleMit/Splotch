import { describe, expect, it } from 'vitest';
import { driftLines } from '../check-generated-files.mjs';

// `git status --porcelain` columns: X is the index, Y the worktree. ruler:check
// runs after a fresh apply, so only Y (or untracked) means the apply changed a file.
describe('driftLines', () => {
  it('ignores a change that is only staged', () => {
    expect(driftLines('M  CLAUDE.md\nA  .claude/skills/x/SKILL.md\n')).toBe('');
  });

  it.each([
    ['modified in the worktree', ' M CLAUDE.md'],
    ['staged and modified again', 'MM AGENTS.md'],
    ['deleted in the worktree', ' D .agents/skill-notes/x.md'],
    ['untracked', '?? .claude/skills/new/SKILL.md'],
  ])('reports a file %s', (_, line) => {
    expect(driftLines(`M  staged.md\n${line}\n`)).toBe(line);
  });

  it('reports nothing for clean output', () => {
    expect(driftLines('')).toBe('');
  });
});
