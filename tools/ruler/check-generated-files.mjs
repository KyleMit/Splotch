// Drift guard for ruler-generated agent files (ADR-0058). CI re-applies Ruler
// and fails if generated output changes. Direct provider packages and notes are
// tracked sources, so their registered paths are excluded alongside .ruler.

import { run, capture, fail, isMain } from '../lib/proc.mjs';
import { directProviderPathspecExclusions } from './lib/direct-provider-skills.mjs';
import { PROVIDERS, RULER_SOURCE, instructionsFile, notesDir, skillsDir } from './lib/layout.mjs';

const GENERATED_PATHSPECS = [
  ...PROVIDERS.map((provider) => `*${instructionsFile(provider)}`),
  ...PROVIDERS.flatMap((provider) => [skillsDir(provider), notesDir(provider)]),
  `:(exclude)${RULER_SOURCE}`,
  ...directProviderPathspecExclusions(),
];

// Only worktree-side changes (second status column) and untracked files count
// as drift — an entry that is merely staged means the apply changed nothing.
export const driftLines = (porcelain) =>
  porcelain
    .split('\n')
    .filter((line) => line.startsWith('??') || (line.length > 1 && line[1] !== ' '))
    .join('\n');

function main() {
  run('npm', ['run', 'ruler:apply']);

  const drift = driftLines(
    capture('git', ['status', '--porcelain', '-uall', '--', ...GENERATED_PATHSPECS])
  );

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
}

if (isMain(import.meta.url)) main();
