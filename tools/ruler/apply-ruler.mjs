// Apply Ruler while preserving the provider-native skill packages that are
// intentionally edited in their destination trees (ADR-0058).

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/proc.mjs';
import { sharedNoteSource } from './mirror-skill-notes.mjs';
import {
  ALL_PROVIDERS,
  DIRECT_PROVIDER_PATHS,
  DIRECT_PROVIDER_SKILLS,
} from './lib/direct-provider-skills.mjs';

export const RULER_STEP_PATHS = Object.freeze({
  mirrorSkillNotes: fileURLToPath(new URL('mirror-skill-notes.mjs', import.meta.url)),
  applySkillForks: fileURLToPath(new URL('apply-skill-forks.mjs', import.meta.url)),
});

export { DIRECT_PROVIDER_PATHS };

export const FORBIDDEN_DIRECT_PROVIDER_SOURCES = DIRECT_PROVIDER_SKILLS.flatMap(({ name }) => [
  `.ruler/skills/${name}`,
  `.ruler/skill-notes/${name}.md`,
  `.ruler/skill-notes/${sharedNoteSource(name)}`,
  ...ALL_PROVIDERS.flatMap((provider) => [
    `.ruler/skill-forks/${provider}/skills/${name}`,
    `.ruler/skill-forks/${provider}/skill-notes/${name}.md.template`,
  ]),
]);

export function withPreservedDirectProviderPaths(root, apply) {
  for (const path of FORBIDDEN_DIRECT_PROVIDER_SOURCES) {
    if (existsSync(join(root, path))) {
      throw new Error(`direct provider skill must not have a Ruler source: ${path}`);
    }
  }

  for (const path of DIRECT_PROVIDER_PATHS) {
    if (!existsSync(join(root, path))) {
      throw new Error(`missing direct provider source: ${path}`);
    }
  }

  const snapshot = mkdtempSync(join(tmpdir(), 'splotch-direct-provider-skills-'));
  try {
    for (const path of DIRECT_PROVIDER_PATHS) {
      const target = join(snapshot, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(root, path), target, { recursive: true });
    }

    try {
      apply();
    } finally {
      for (const path of DIRECT_PROVIDER_PATHS) {
        const target = join(root, path);
        rmSync(target, { recursive: true, force: true });
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(snapshot, path), target, { recursive: true });
      }
    }
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

function runStep(command, args) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status ?? 'without a status'}`);
  }
}

function main() {
  withPreservedDirectProviderPaths(ROOT, () => {
    runStep('ruler', ['apply']);
    runStep(process.execPath, [RULER_STEP_PATHS.mirrorSkillNotes]);
    runStep(process.execPath, [RULER_STEP_PATHS.applySkillForks]);
  });
  runStep('dprint', ['fmt']);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
