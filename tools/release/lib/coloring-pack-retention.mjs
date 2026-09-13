import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { compareSemverDesc } from './release-frontmatter.mjs';

export const COLORING_PACK_SNAPSHOT_DIR = join(ROOT, 'tools', 'release', 'coloring-pack-snapshots');
const WEB_STATIC_DIR = join(ROOT, 'web', 'static');

// Released native apps whose manifest-addressed pack files the deployed origin
// no longer serves, pinned to the exact broken-file count so a further deletion
// and a partial restore both fail the guard. Each entry is an open defect, not
// an exemption: ADR-0103 requires retention for the installed app's lifetime.
// TODO: v1.5.0's pack files were deleted or regenerated in place after release, so
// every downloadable book fails on those installs. Resolve the ADR-0103 retention
// breach (restore reachable bytes or retire the release), then drop the entry.
const KNOWN_BROKEN_RELEASES = { '1.5.0': 513 };

/**
 * Reduce a generated coloring-pack manifest to what an installed native app
 * requests from the origin: every non-starter book's download paths across
 * both resolution variants, each with the digest the app verifies.
 */
export function snapshotFromManifest(manifest, { ref, commit }) {
  const books = manifest.books
    .filter((book) => book.id !== manifest.starterBookId)
    .map((book) => {
      const files = {};
      for (const variant of Object.values(book.variants)) {
        for (const file of variant.files) {
          const downloadPath = file.downloadPath ?? file.path;
          if (files[downloadPath] && files[downloadPath] !== file.sha256) {
            throw new Error(`${downloadPath} carries two digests in ${book.id}`);
          }
          files[downloadPath] = file.sha256;
        }
      }
      const sorted = Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
      );
      return { id: book.id, files: sorted };
    });
  return {
    ref,
    commit,
    appVersion: manifest.appVersion,
    starterBookId: manifest.starterBookId,
    books,
  };
}

export function readSnapshots(dir = COLORING_PACK_SNAPSHOT_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')))
    .sort((a, b) => compareSemverDesc(b.appVersion, a.appVersion));
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Every snapshot file the origin would fail to serve byte-identically, judged
 * against the static tree the web deploy publishes verbatim. The cache lets
 * several releases share one hash per path.
 */
export function retentionBreaks(
  snapshot,
  { staticDir = WEB_STATIC_DIR, digests = new Map() } = {}
) {
  const breaks = [];
  for (const book of snapshot.books) {
    for (const [downloadPath, sha256] of Object.entries(book.files)) {
      const absolute = join(staticDir, downloadPath);
      if (!digests.has(absolute)) {
        digests.set(absolute, existsSync(absolute) ? sha256File(absolute) : null);
      }
      const served = digests.get(absolute);
      if (served === sha256) continue;
      breaks.push({
        bookId: book.id,
        downloadPath,
        reason: served === null ? 'missing' : 'changed',
      });
    }
  }
  return breaks;
}

export function retentionProblems(results, knownBroken = KNOWN_BROKEN_RELEASES) {
  const problems = [];
  const versions = new Set(results.map(({ snapshot }) => snapshot.appVersion));
  for (const { snapshot, breaks } of results) {
    const expected = knownBroken[snapshot.appVersion] ?? 0;
    if (breaks.length === expected) continue;
    problems.push(
      expected === 0
        ? `${snapshot.appVersion}: ${breaks.length} manifest-addressed file(s) no longer served (first: ${breaks[0].downloadPath})`
        : `${snapshot.appVersion}: ${breaks.length} broken file(s), KNOWN_BROKEN_RELEASES pins ${expected} — update the pin only if files were restored`
    );
  }
  for (const version of Object.keys(knownBroken)) {
    if (!versions.has(version)) {
      problems.push(`${version}: pinned as known-broken but has no snapshot`);
    }
  }
  return problems;
}

export function checkColoringPackRetention({
  snapshotDir = COLORING_PACK_SNAPSHOT_DIR,
  staticDir = WEB_STATIC_DIR,
  knownBroken = KNOWN_BROKEN_RELEASES,
} = {}) {
  const digests = new Map();
  const results = readSnapshots(snapshotDir).map((snapshot) => ({
    snapshot,
    breaks: retentionBreaks(snapshot, { staticDir, digests }),
  }));
  return { results, problems: retentionProblems(results, knownBroken) };
}
