// Drift guard for the ruler-generated agent files (ADR-0058). Every
// CLAUDE.md/AGENTS.md plus the .claude/skills/ and .agents/skills/ trees are
// generated from .ruler/ sources and committed, so CI re-applies and fails if
// git sees any resulting change (modified or untracked) — that means a .ruler
// edit landed without `npm run ruler:apply`, or a generated file was edited
// directly. The .ruler/ sources themselves are excluded so local uncommitted
// source edits don't read as drift once they've been applied.

import { run, capture, fail } from './lib/utils.mjs';

run('npm', ['run', 'ruler:apply']);

const generatedPathspecs = [
  '*CLAUDE.md',
  '*AGENTS.md',
  '.claude/skills',
  '.agents/skills',
  ':(exclude).ruler',
];
// Only worktree-side changes (second status column) and untracked files count
// as drift — an entry that is merely staged means the apply changed nothing.
const drift = capture('git', ['status', '--porcelain', '-uall', '--', ...generatedPathspecs])
  .split('\n')
  .filter((line) => line.startsWith('??') || (line.length > 1 && line[1] !== ' '))
  .join('\n')
  .trim();

if (drift) {
  fail(
    [
      '[ruler:check] Generated agent files are out of sync with the .ruler/ sources:',
      '',
      drift,
      '',
      'Run `npm run ruler:apply` and commit the regenerated files.',
      'Never edit CLAUDE.md/AGENTS.md or the skill copies directly — edit .ruler/** instead.',
    ].join('\n')
  );
}

console.log('[ruler:check] Generated agent files are in sync with .ruler/.');
