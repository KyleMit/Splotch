// The commit web/build was built from, stamped at build time (postperf:build).
//
// The capture-side alternative — resolving HEAD when an artifact is written —
// records the wrong commit whenever HEAD moves after the build: the served
// bytes and web/build still agree (both are the OLD build), so the freshness
// guard passes while the artifact claims a commit whose product was never
// measured. Provenance has to be written by the thing that knows it, which is
// the build step itself. A build from a dirty tree records `dirty: true`,
// because no commit describes bytes that include uncommitted edits, and its
// stamp resolves to no commit for the same reason.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, capture } from '../../lib/proc.mjs';
import { rethrowIfBroken } from './error-classification.mjs';

export const BUILD_PROVENANCE_FILE = '.perf-build-provenance.json';

export function buildProvenance(git = defaultGit) {
  const commit = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain']);
  if (commit === null || status === null) return null;
  return { commit, dirty: status !== '' };
}

function defaultGit(args) {
  try {
    return capture('git', args).trim();
  } catch (error) {
    rethrowIfBroken(error);
    // Outside a repository (or with git absent) there is no provenance to
    // record, and the stamp is simply not written.
    return null;
  }
}

export function writeBuildProvenance(buildDir = join(ROOT, 'web', 'build')) {
  const provenance = buildProvenance();
  if (!provenance) return null;
  writeFileSync(join(buildDir, BUILD_PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

export function stampedBuildCommit(buildDir = join(ROOT, 'web', 'build')) {
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(join(buildDir, BUILD_PROVENANCE_FILE), 'utf8'));
  } catch (error) {
    rethrowIfBroken(error);
    // An unstamped or unreadable build proves nothing about its commit.
    return null;
  }
  return typeof stamp?.commit === 'string' && stamp.dirty === false ? stamp.commit : null;
}
