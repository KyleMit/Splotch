import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRivalPrompt, describeRound, MAX_PROMPT_BYTES, readPromptFile } from '../prompt.mjs';

const SCOPE = {
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  description: 'pull request 7',
  range: `${'a'.repeat(40)}...${'b'.repeat(40)}`,
};

describe('rival prompt', () => {
  it('fills every placeholder for a first-round review', () => {
    const prompt = buildRivalPrompt({ scope: SCOPE, worktree: '/wt', packetDir: '/wt/.packet' });
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain('a review of pull request 7');
    expect(prompt).toContain('`/wt`');
    expect(prompt).toContain('`/wt/.packet`');
    expect(prompt).toContain(`git diff ${SCOPE.range}`);
    expect(prompt).toContain('Reporting no defects is a correct and expected outcome');
    expect(prompt).not.toContain('## Round');
    expect(prompt).not.toContain('Extra instructions');
  });

  it('frames a question instead of a review when one is given', () => {
    const prompt = buildRivalPrompt({
      scope: SCOPE,
      question: 'Does the retry loop terminate?',
      worktree: '/wt',
      packetDir: '/p',
    });
    expect(prompt).toContain('Does the retry loop terminate?');
    expect(prompt).toContain('`findings` may be empty');
    expect(prompt).not.toContain('a review of pull request 7');
  });

  it('appends handler instructions and a later round', () => {
    const prompt = buildRivalPrompt({
      scope: SCOPE,
      worktree: '/wt',
      packetDir: '/p',
      round: 2,
      previous: { lastHead: 'c'.repeat(40) },
      landedCommits: 'abc fix it',
      extraInstructions: 'Focus on the undo stack.',
    });
    expect(prompt).toContain('## Round 2');
    expect(prompt).toContain('abc fix it');
    expect(prompt).toContain('Focus on the undo stack.');
  });

  it('tells a resumed reviewer when the old head is unreachable', () => {
    expect(
      describeRound({ round: 3, previous: { lastHead: 'x' }, landedCommits: undefined })
    ).toContain('no longer reachable');
    expect(describeRound({ round: 2, previous: {}, landedCommits: '' })).toContain(
      '(no new commits)'
    );
  });

  it('reads a bounded absolute prompt file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rival-prompt-test-'));
    try {
      const path = join(directory, 'p.md');
      writeFileSync(path, 'focus\n');
      expect(readPromptFile(path)).toBe('focus\n');
      writeFileSync(path, ' \n');
      expect(() => readPromptFile(path)).toThrow(/empty/);
      writeFileSync(path, 'x'.repeat(MAX_PROMPT_BYTES + 1));
      expect(() => readPromptFile(path)).toThrow(/exceeds/);
      expect(() => readPromptFile('relative.md')).toThrow(/absolute/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
