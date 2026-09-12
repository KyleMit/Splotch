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

// Restore staging lands beside the package rather than replacing it in place:
// a denied write (a sandboxed reviewer, a read-only provider tree) then fails
// while the committed package is still intact, instead of after `rmSync` has
// emptied it. The swap that follows is a rename within one directory.
export const RESTORE_STAGING_SUFFIX = '.ruler-restore';

function restoreDirectProviderPath(source, target) {
  // A path `ruler apply` never got to replace needs no write at all. Skipping it
  // is what lets a run that was denied one provider tree finish reporting only
  // the denial, rather than 4 more failures against packages already correct.
  if (sameContent(source, target)) return;

  const staged = `${target}${RESTORE_STAGING_SUFFIX}`;
  mkdirSync(dirname(target), { recursive: true });
  rmSync(staged, { recursive: true, force: true });
  cpSync(source, staged, { recursive: true });
  try {
    rmSync(target, { recursive: true, force: true });
    renameSync(staged, target);
  } catch (error) {
    rmSync(staged, { recursive: true, force: true });
    throw error;
  }
}

// Every registered path gets its own attempt. The loop used to abandon each
// path after the first throw, so one denied tree left the rest as `ruler apply`
// had left them — deleted — and the next run blamed its own missing-source
// precondition rather than the run that did the deleting.
function restoreDirectProviderPaths(root, snapshot) {
  const failures = [];
  for (const path of DIRECT_PROVIDER_PATHS) {
    try {
      restoreDirectProviderPath(join(snapshot, path), join(root, path));
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

export function withPreservedDirectProviderPaths(root, apply) {
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

    const failures = restoreDirectProviderPaths(root, snapshot);
    if (failures.length > 0) throw unrestoredPathsError(failures, applyError);
    if (applyError) throw applyError;
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
