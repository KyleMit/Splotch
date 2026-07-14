// Promote a run artifact into the committed /artifacts tree and regenerate the
// landing page (ADR-0059). Ephemeral tool outputs stay gitignored
// (lighthouse-reports/, .coloring-samples/, web/tests/redteam/output/, …); this
// copies a chosen keeper in so it survives and gets a live GitHub Pages URL.
//
//   node scripts/publish-artifact.mjs <source> <type>/<name>   publish a file or dir
//   node scripts/publish-artifact.mjs --index-only             just rebuild index.html
//
// Cross-platform (ADR-0017): pure node:fs, no shell.

import { cpSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, fail } from './lib/utils.mjs';
import { buildArtifactsIndex } from './lib/artifacts-index.mjs';

// Project Pages site: https://<owner>.github.io/<repo>/ — the subdomain is
// lowercased by GitHub, the repo segment keeps its casing. Update if the repo
// is renamed or moved.
const PAGES_BASE = 'https://kylemit.github.io/Splotch/';

const ARTIFACTS_DIR = join(ROOT, 'artifacts');

function writeIndex() {
  writeFileSync(join(ARTIFACTS_DIR, 'index.html'), buildArtifactsIndex(ARTIFACTS_DIR));
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--index-only') {
    writeIndex();
    console.log(`Rebuilt artifacts/index.html → ${PAGES_BASE}`);
    return;
  }

  const [source, dest] = args;
  if (!source || !dest) {
    fail(
      'Usage: node scripts/publish-artifact.mjs <source> <type>/<name>\n' +
        '       node scripts/publish-artifact.mjs --index-only'
    );
  }

  const srcPath = resolve(process.cwd(), source);
  try {
    statSync(srcPath);
  } catch {
    fail(`Source not found: ${srcPath}`);
  }

  // Keep the destination inside artifacts/ — reject absolute paths and ../ escapes.
  const destPath = resolve(ARTIFACTS_DIR, dest);
  const rel = relative(ARTIFACTS_DIR, destPath);
  if (rel.startsWith('..') || resolve(ARTIFACTS_DIR, rel) !== destPath) {
    fail(`Destination must stay within artifacts/: got "${dest}"`);
  }

  mkdirSync(dirname(destPath), { recursive: true });
  cpSync(srcPath, destPath, { recursive: true });
  writeIndex();

  const url =
    PAGES_BASE + rel.split('\\').join('/') + (statSync(destPath).isDirectory() ? '/' : '');
  console.log(`Published ${source} → artifacts/${rel.split('\\').join('/')}`);
  console.log(`Live (after Pages deploy): ${url}`);
  console.log(`Index: ${PAGES_BASE}`);
  console.log('Commit & push to publish; the Pages deploy runs on merge to main.');
}

main();
