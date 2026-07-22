// Promote a keeper run output into the committed /scrapbook tree and regenerate
// the landing page (ADR-0059). Ephemeral tool outputs stay gitignored
// (lighthouse-reports/, .coloring-samples/, web/tests/redteam/output/, …); this
// copies a chosen keeper in so it survives and gets a live GitHub Pages URL.
//
//   node scripts/publish-scrapbook.mjs <source> <type>/<name>   publish a file or dir
//   node scripts/publish-scrapbook.mjs --index-only             just rebuild index.html
//
// Cross-platform (ADR-0017): pure node:fs, no shell.

import { cpSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, fail } from './lib/utils.mjs';
import { buildScrapbookIndex } from './lib/scrapbook-index.mjs';

// Project Pages site: https://<owner>.github.io/<repo>/ — the subdomain is
// lowercased by GitHub, the repo segment keeps its casing. Update if the repo
// is renamed or moved.
const PAGES_BASE = 'https://kylemit.github.io/Splotch/';

const SCRAPBOOK_DIR = join(ROOT, 'scrapbook');

function writeIndex() {
  writeFileSync(join(SCRAPBOOK_DIR, 'index.html'), buildScrapbookIndex(SCRAPBOOK_DIR));
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--index-only') {
    writeIndex();
    console.log(`Rebuilt scrapbook/index.html → ${PAGES_BASE}`);
    return;
  }

  const [source, dest] = args;
  if (!source || !dest) {
    fail(
      'Usage: node scripts/publish-scrapbook.mjs <source> <type>/<name>\n' +
        '       node scripts/publish-scrapbook.mjs --index-only'
    );
  }

  const srcPath = resolve(process.cwd(), source);
  try {
    statSync(srcPath);
  } catch {
    fail(`Source not found: ${srcPath}`);
  }

  // Keep the destination inside scrapbook/ — reject absolute paths and ../ escapes.
  const destPath = resolve(SCRAPBOOK_DIR, dest);
  const rel = relative(SCRAPBOOK_DIR, destPath);
  if (rel.startsWith('..') || resolve(SCRAPBOOK_DIR, rel) !== destPath) {
    fail(`Destination must stay within scrapbook/: got "${dest}"`);
  }

  mkdirSync(dirname(destPath), { recursive: true });
  cpSync(srcPath, destPath, { recursive: true });
  writeIndex();

  const url =
    PAGES_BASE + rel.split('\\').join('/') + (statSync(destPath).isDirectory() ? '/' : '');
  console.log(`Published ${source} → scrapbook/${rel.split('\\').join('/')}`);
  console.log(`Live (after Pages deploy): ${url}`);
  console.log(`Index: ${PAGES_BASE}`);
  console.log('Commit & push to publish; the Pages deploy runs on merge to main.');
}

main();
