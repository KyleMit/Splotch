// Apply Ruler while preserving the provider-native skill packages that are
// intentionally edited in their destination trees (ADR-0058).

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/proc.mjs';
import { assertDprintPlugins } from '../check-dprint-plugins.mjs';
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

function fileEntries(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}

function sameContent(source, target) {
  if (!existsSync(target)) return false;
  const sourceIsFile = statSync(source).isFile();
  if (sourceIsFile !== statSync(target).isFile()) return false;
  if (sourceIsFile) return readFileSync(source).equals(readFileSync(target));

  const entries = fileEntries(source);
  if (entries.join('\n') !== fileEntries(target).join('\n')) return false;
  return entries.every((entry) =>
    readFileSync(join(source, entry)).equals(readFileSync(join(target, entry)))
  );
}

// Restore copies to a staging path before removing the target, so a denied
// write (a sandboxed reviewer, a read-only provider tree) fails while the
// committed package is still intact instead of after `rmSync` has emptied it.
//
// Staging sits at the repo root rather than beside the package. A rename needs
// the same filesystem, not the same directory, and a stage inside
// `.claude/skills/` is a directory a runner would load as a skill and
// `ruler:check` would report as untracked drift if a hard kill left one behind.
// One mkdtemp root per run also means a run can never meet a previous run's
// stage, so the restore has no pre-existing staging path to reason about.
const RESTORE_STAGING_PREFIX = '.ruler-restore-';

// Created on the first path that actually needs a stage: a run whose packages
// are all still correct must not fail on a staging mkdtemp — in a checkout too
// locked down to write at all, that error would replace the generation failure
// the operator needs to see.
function createStagingRoot(root) {
  let staging;
  return {
    pathFor: (path) => join((staging ??= mkdtempSync(join(root, RESTORE_STAGING_PREFIX))), path),
    cleanup: () => {
      if (staging) rmSync(staging, { recursive: true, force: true });
    },
  };
}

// The two irreversible filesystem steps of the swap, injected so a test can fail
// the copy with a target still on disk and the rename with it already removed.
// Neither fault has a deterministic cross-platform trigger otherwise: a chmod is
// a no-op for a session running as root, and the copy's destination is a private
// staging root a test cannot poison. No production caller overrides them.
const RESTORE_EFFECTS = Object.freeze({ copy: cpSync, rename: renameSync });

function restoreDirectProviderPath(root, snapshot, path, staging, effects) {
  const source = join(snapshot, path);
  const target = join(root, path);

  // A path `ruler apply` never got to replace needs no write at all. Skipping it
  // is what lets a run that was denied one provider tree finish reporting only
  // the denial, rather than 4 more failures against packages already correct.
  if (sameContent(source, target)) return;

  const staged = staging.pathFor(path);
  mkdirSync(dirname(staged), { recursive: true });
  effects.copy(source, staged, { recursive: true });
  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  effects.rename(staged, target);
}

// Every registered path gets its own attempt. The loop used to abandon each
// path after the first throw, so one denied tree left the rest as `ruler apply`
// had left them — deleted — and the next run blamed its own missing-source
// precondition rather than the run that did the deleting.
function restoreDirectProviderPaths(root, snapshot, staging, effects) {
  const failures = [];
  for (const path of DIRECT_PROVIDER_PATHS) {
    try {
      restoreDirectProviderPath(root, snapshot, path, staging, effects);
    } catch (error) {
      failures.push({ path, error });
    }
  }
  return failures;
}

function unrestoredPathsError(failures, applyError) {
  const lines = [
    `could not restore ${failures.length} of ${DIRECT_PROVIDER_PATHS.length} direct provider paths:`,
    ...failures.map(({ path, error }) => `  ${path}: ${error.message.split('\n')[0]}`),
    '',
    'Restore them from git before running ruler:apply again:',
    `  git restore -- ${failures.map(({ path }) => path).join(' ')}`,
  ];
  if (applyError) {
    lines.push('', `Generation failed first: ${applyError.message.split('\n')[0]}`);
  }
  const causes = failures.map(({ error }) => error);
  return new AggregateError(applyError ? [applyError, ...causes] : causes, lines.join('\n'));
}

export function withPreservedDirectProviderPaths(root, apply, effects = RESTORE_EFFECTS) {
  for (const path of FORBIDDEN_DIRECT_PROVIDER_SOURCES) {
    if (existsSync(join(root, path))) {
      throw new Error(`direct provider skill must not have a Ruler source: ${path}`);
    }
  }

  for (const path of DIRECT_PROVIDER_PATHS) {
    if (!existsSync(join(root, path))) {
      throw new Error(
        `missing direct provider source: ${path}\n` +
          'An interrupted ruler:apply can delete these tracked packages; ' +
          `restore it with \`git restore -- ${path}\` before retrying.`
      );
    }
  }

  const snapshot = mkdtempSync(join(tmpdir(), 'splotch-direct-provider-skills-'));
  const staging = createStagingRoot(root);
  try {
    for (const path of DIRECT_PROVIDER_PATHS) {
      const target = join(snapshot, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(root, path), target, { recursive: true });
    }

    let applyError;
    try {
      apply();
    } catch (error) {
      applyError = error;
    }

    const failures = restoreDirectProviderPaths(root, snapshot, staging, effects);
    if (failures.length > 0) throw unrestoredPathsError(failures, applyError);
    if (applyError) throw applyError;
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
    staging.cleanup();
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
  // Before anything is regenerated: the run ends in `dprint fmt`, and a stale
  // plugin install would fail it after the whole agent tree has been rewritten.
  assertDprintPlugins(ROOT);

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
