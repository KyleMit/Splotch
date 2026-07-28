// Drift guard for ruler-generated agent files (ADR-0058). CI re-applies Ruler
// and fails if generated output changes. The provider-specific
// burn-down-audits packages and notes are direct tracked sources, so their four
// paths are excluded alongside .ruler itself.

import { run, capture, fail } from './lib/proc.mjs';

run('npm', ['run', 'ruler:apply']);

const generatedPathspecs = [
  '*CLAUDE.md',
  '*AGENTS.md',
  '.claude/skills',
  '.agents/skills',
  '.claude/skill-notes',
  '.agents/skill-notes',
  ':(exclude).ruler',
  ':(exclude).claude/skills/burn-down-audits',
  ':(exclude).agents/skills/burn-down-audits',
  ':(exclude).claude/skill-notes/burn-down-audits.md',
  ':(exclude).agents/skill-notes/burn-down-audits.md',
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
      'Never edit generated files directly — edit .ruler/** instead.',
      'The direct provider-specific burn-down-audits packages are the only exception.',
    ].join('\n')
  );
}

console.log('[ruler:check] Generated agent files are in sync with .ruler/.');
