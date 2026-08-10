// Promote a keeper run output into the committed /scrapbook tree and regenerate
// the landing page (ADR-0059). Ephemeral tool outputs stay gitignored
// (lighthouse-reports/, .coloring-samples/, web/tests/redteam/output/, …); this
// copies a chosen keeper in so it survives and gets a live GitHub Pages URL.
//
//   node tools/scrapbook/publish-scrapbook.mjs <source> <type>/<name>   publish a file or dir
//   node tools/scrapbook/publish-scrapbook.mjs --index-only             just rebuild index.html
//   node tools/scrapbook/publish-scrapbook.mjs --check                  fail if a collection has no entry page
//
// Cross-platform (ADR-0017): pure node:fs, no shell.

import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, fail } from '../lib/proc.mjs';
import {
  buildScrapbookIndex,
  coloringBookProofSheetHubProblems,
  collectionsMissingEntry,
  OWNER,
  REPO,
} from './lib/scrapbook-index.mjs';
import {
  buildColoringBookProofSheetHub,
  PROOF_SHEET_HUB_PATH,
} from './gen-coloring-book-proof-sheet-hub.mjs';

// Project Pages site: https://<owner>.github.io/<repo>/ — GitHub lowercases the
// subdomain, the repo segment keeps its casing. Owner/repo are sourced from
// scrapbook-index.mjs so this base and its Markdown blob links can't drift.
const PAGES_BASE = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;

const SCRAPBOOK_DIR = join(ROOT, 'scrapbook');
const INDEX_PATH = join(SCRAPBOOK_DIR, 'index.html');

function writeIndex() {
  writeFileSync(INDEX_PATH, buildScrapbookIndex(SCRAPBOOK_DIR));
}

function writeProofSheetHub() {
  writeFileSync(PROOF_SHEET_HUB_PATH, buildColoringBookProofSheetHub());
}

function writeGeneratedPages() {
  writeIndex();
  writeProofSheetHub();
}

const USAGE =
  'Usage: node tools/scrapbook/publish-scrapbook.mjs <source> <type>/<name>\n' +
  '       node tools/scrapbook/publish-scrapbook.mjs --index-only';

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { check: { type: 'boolean' }, 'index-only': { type: 'boolean' } },
  });

  if (values.check && values['index-only']) {
    fail(USAGE);
  }

  if ((values.check || values['index-only']) && positionals.length) {
    fail(USAGE);
  }

  if (values['index-only']) {
    writeGeneratedPages();
    console.log(
      `Rebuilt scrapbook/index.html and coloring-book-proof-sheets/index.html → ${PAGES_BASE}`
    );
    return;
  }

  // Drift guard (CI): every collection dir must resolve to at least one linked
  // entry page, so the index's "N collections" count always matches the cards it
  // shows — an md-only collection that once vanished now surfaces (issue #490) —
  // and the committed index.html must be up to date with the tree.
  if (values.check) {
    const missing = collectionsMissingEntry(SCRAPBOOK_DIR);
    if (missing.length) {
      fail(
        'Scrapbook collections with no reachable entry page (counted in the index but shown as no card):\n' +
          missing.map((m) => `  - scrapbook/${m}/`).join('\n') +
          '\nAdd an .html entry page or an .md report, or remove the empty dir. See scrapbook/README.md.'
      );
    }
    const proofSheetProblems = coloringBookProofSheetHubProblems(
      join(SCRAPBOOK_DIR, 'coloring-book-proof-sheets')
    );
    if (proofSheetProblems.length) {
      fail(
        'Coloring-book proof-sheet hub is out of sync:\n' +
          proofSheetProblems.map((problem) => `  - ${problem}`).join('\n')
      );
    }
    if (readFileSync(PROOF_SHEET_HUB_PATH, 'utf8') !== buildColoringBookProofSheetHub()) {
      fail(
        'scrapbook/coloring-book-proof-sheets/index.html is stale — run `npm run scrapbook:index` and commit the result.'
      );
    }
    // Structural freshness: a collection added/removed without re-running
    // scrapbook:index would leave the committed page's chip/cards stale while the
    // reachability check above still passes. Compare a fresh render against the
    // committed one, ignoring only the mtime-derived "Updated <date>" stamps —
    // git doesn't preserve mtimes, so those aren't checkout-stable and would
    // false-positive in CI; the card structure (which the invariant is about) is.
    const stripDates = (html) => html.replace(/Updated \d{4}-\d{2}-\d{2}/g, 'Updated');
    const committed = readFileSync(INDEX_PATH, 'utf8');
    if (stripDates(committed) !== stripDates(buildScrapbookIndex(SCRAPBOOK_DIR))) {
      fail('scrapbook/index.html is stale — run `npm run scrapbook:index` and commit the result.');
    }
    console.log(
      'scrapbook: every collection resolves to a reachable entry page; index.html is current.'
    );
    return;
  }

  const [source, dest] = positionals;
  if (!source || !dest) {
    fail(USAGE);
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
  writeGeneratedPages();

  const url = PAGES_BASE + rel + (statSync(destPath).isDirectory() ? '/' : '');
  console.log(`Published ${source} → scrapbook/${rel}`);
  console.log(`Live (after Pages deploy): ${url}`);
  console.log(`Index: ${PAGES_BASE}`);
  console.log('Commit & push to publish; the Pages deploy runs on merge to main.');
}

main();
