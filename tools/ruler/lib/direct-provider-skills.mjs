import { join } from 'node:path';

export const DIRECT_PROVIDER_SKILLS = [
  { name: 'analyze-session-transcripts', providers: ['claude', 'codex'] },
  { name: 'burn-down-audits', providers: ['claude', 'codex'] },
  { name: 'implement-issue-stack', providers: ['codex'] },
  { name: 'run-rival-agent', providers: ['claude', 'codex'] },
];

const PROVIDER_ROOTS = {
  claude: '.claude',
  codex: '.agents',
};

export const ALL_PROVIDERS = Object.freeze(Object.keys(PROVIDER_ROOTS));

function providerRoot(provider) {
  const root = PROVIDER_ROOTS[provider];
  if (!root) throw new Error(`unsupported direct provider: ${provider}`);
  return root;
}

export const DIRECT_PROVIDER_PATHS = DIRECT_PROVIDER_SKILLS.flatMap(({ name, providers }) =>
  providers.flatMap((provider) => {
    const root = providerRoot(provider);
    return [join(root, 'skills', name), join(root, 'skill-notes', `${name}.md`)];
  })
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
