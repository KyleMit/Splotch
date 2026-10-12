import { join } from 'node:path';
import { notesDir, skillsDir } from './layout.mjs';

export const DIRECT_PROVIDER_SKILLS = [
  { name: 'analyze-session-transcripts', providers: ['claude', 'codex'] },
  { name: 'burn-down-audits', providers: ['claude', 'codex'] },
  { name: 'reconcile-agent-memories', providers: ['claude'] },
  { name: 'run-rival-agent', providers: ['claude', 'codex'] },
];

export const DIRECT_PROVIDER_PATHS = DIRECT_PROVIDER_SKILLS.flatMap(({ name, providers }) =>
  providers.flatMap((provider) => [
    join(skillsDir(provider), name),
    join(notesDir(provider), `${name}.md`),
  ])
);

export function directNoteNames(provider) {
  return new Set(
    DIRECT_PROVIDER_SKILLS.filter(({ providers }) => providers.includes(provider)).map(
      ({ name }) => `${name}.md`
    )
  );
}

export function directProviderPathspecExclusions() {
  return DIRECT_PROVIDER_PATHS.map((path) => `:(exclude)${path}`);
}
