import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRivalPrompt,
  describeExecutionMode,
  describeRound,
  MAX_PROMPT_BYTES,
  readPromptFile,
} from '../prompt.mjs';

const SCOPE = {
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  description: 'pull request 7',
  range: `${'a'.repeat(40)}...${'b'.repeat(40)}`,
};
const TOOL_BOUNDARY = '* **Local tools.** Read only.';

describe('rival prompt', () => {
  it('fills every placeholder for a first-round review', () => {
    const prompt = buildRivalPrompt({
      scope: SCOPE,
      worktree: '/wt',
      packetDir: '/wt/.packet',
      toolBoundary: TOOL_BOUNDARY,
    });
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain('a review of pull request 7');
    expect(prompt).toContain('`/wt`');
    expect(prompt).toContain('`/wt/.packet`');
    expect(prompt).toContain(`git diff ${SCOPE.range}`);
    expect(prompt).toContain('Reporting no defects is a correct and expected outcome');
    expect(prompt).toContain(TOOL_BOUNDARY);
    expect(prompt).not.toContain('## Round');
    expect(prompt).not.toContain('Extra instructions');
  });

  it('describes the broker as the one door by default', () => {
    const prompt = buildRivalPrompt({
      scope: SCOPE,
      worktree: '/wt',
      packetDir: '/p',
      toolBoundary: TOOL_BOUNDARY,
    });
    expect(prompt).toContain('## The `run` tool');
    expect(prompt).toContain('waiting to run commands for you');
    expect(prompt).toContain('It is read-only to you');
    expect(prompt).toContain('reproduced through `run`');
    expect(prompt).not.toContain('## Running commands');
  });

  // A hybrid rival has a shell and the broker: it must be told to run locally first, that a
  // sandbox refusal is the signal to escalate rather than a decline, and that the worktree is
  // writable — the first real round filed its own sandbox's EPERM as a handler decline.
  it('tells a hybrid rival to run locally first and escalate what the sandbox refuses', () => {
    const prompt = buildRivalPrompt({
      scope: SCOPE,
      worktree: '/wt',
      packetDir: '/p',
      sandbox: 'workspace-write',
      toolBoundary: TOOL_BOUNDARY,
    });
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain('## Running commands');
    expect(prompt).toContain(TOOL_BOUNDARY);
    expect(prompt).toContain('runs only what your sandbox refuses');
    expect(prompt).toContain('Your shell may write inside it');
    expect(prompt).toContain('Run it here first');
    expect(prompt).toContain('signal to escalate');
    expect(prompt).toContain('device rig');
    expect(prompt).toContain('through `run` when the sandbox refuses');
    expect(prompt).not.toContain('## The `run` tool');
    expect(prompt).not.toContain('It is read-only to you');
    expect(Object.keys(describeExecutionMode('workspace-write'))).toEqual(
      Object.keys(describeExecutionMode('read-only'))
    );
    expect(() => describeExecutionMode('danger-full-access')).toThrow(/sandbox/);
    expect(() =>
      buildRivalPrompt({
        scope: SCOPE,
        worktree: '/wt',
        packetDir: '/p',
        sandbox: 'danger-full-access',
        toolBoundary: TOOL_BOUNDARY,
      })
    ).toThrow(/sandbox/);
  });

  it('frames a question instead of a review when one is given', () => {
    const prompt = buildRivalPrompt({
      scope: SCOPE,
      question: 'Does the retry loop terminate?',
      worktree: '/wt',
      packetDir: '/p',
      toolBoundary: TOOL_BOUNDARY,
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
      toolBoundary: TOOL_BOUNDARY,
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
