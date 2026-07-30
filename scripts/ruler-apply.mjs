// Apply Ruler while preserving the provider-native skill packages that are
// intentionally edited in their destination trees (ADR-0058).

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/proc.mjs';
import { sharedNoteSource } from './mirror-skill-notes.mjs';

export const DIRECT_PROVIDER_PATHS = [
  '.claude/skills/burn-down-audits',
  '.agents/skills/burn-down-audits',
  '.claude/skill-notes/burn-down-audits.md',
  '.agents/skill-notes/burn-down-audits.md',
];

export const FORBIDDEN_DIRECT_PROVIDER_SOURCES = [
  '.ruler/skills/burn-down-audits',
  // A shared note is authored with SHARED_NOTE_SUFFIX; the bare .md stays listed
  // so a stray one is rejected here, by the guard that names the actual rule,
  // rather than downstream by the mirror's generic suffix check.
  '.ruler/skill-notes/burn-down-audits.md',
  `.ruler/skill-notes/${sharedNoteSource('burn-down-audits')}`,
  '.ruler/skill-forks/claude/skills/burn-down-audits',
  '.ruler/skill-forks/codex/skills/burn-down-audits',
  '.ruler/skill-forks/claude/skill-notes/burn-down-audits.md.template',
  '.ruler/skill-forks/codex/skill-notes/burn-down-audits.md.template',
];

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
    runStep(process.execPath, ['scripts/mirror-skill-notes.mjs']);
    runStep(process.execPath, ['scripts/apply-ruler-skill-forks.mjs']);
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
