// Where Ruler's sources live and where each runner's generated tree lands. The
// runner list must equal `default_agents` in .ruler/ruler.toml, and the output
// roots must match the linguist-generated rules in .gitattributes; neither file
// can import this, so tests/layout.test.mjs reads both against it.

import { join } from 'node:path';

export const RULER_SOURCE = '.ruler';
export const SHARED_SKILLS_SOURCE = join(RULER_SOURCE, 'skills');
export const SHARED_NOTES_SOURCE = join(RULER_SOURCE, 'skill-notes');
export const FORK_SOURCE = join(RULER_SOURCE, 'skill-forks');

const PROVIDER_LAYOUT = {
  claude: { root: '.claude', instructions: 'CLAUDE.md' },
  codex: { root: '.agents', instructions: 'AGENTS.md' },
};

export const PROVIDERS = Object.freeze(Object.keys(PROVIDER_LAYOUT));

function layoutFor(provider) {
  if (!Object.hasOwn(PROVIDER_LAYOUT, provider)) {
    throw new Error(`unsupported ruler provider: ${provider}`);
  }
  return PROVIDER_LAYOUT[provider];
}

export const instructionsFile = (provider) => layoutFor(provider).instructions;
export const skillsDir = (provider) => join(layoutFor(provider).root, 'skills');
export const notesDir = (provider) => join(layoutFor(provider).root, 'skill-notes');
