// Drift guard for ruler-generated agent files (ADR-0058). CI re-applies Ruler
// and fails if generated output changes. Direct provider packages and notes are
// tracked sources, so their registered paths are excluded alongside .ruler.

import { run, capture, fail } from '../lib/proc.mjs';
import { directProviderPathspecExclusions } from './lib/direct-provider-skills.mjs';

run('npm', ['run', 'ruler:apply']);

const generatedPathspecs = [
  '*CLAUDE.md',
  '*AGENTS.md',
  '.claude/skills',
  '.agents/skills',
  '.claude/skill-notes',
  '.agents/skill-notes',
  ':(exclude).ruler',
  ...directProviderPathspecExclusions(),
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
      'Registered direct provider packages are the only exceptions.',
    ].join('\n')
  );
}

console.log('[ruler:check] Generated agent files are in sync with .ruler/.');
