// Promote a keeper run output into the committed /scrapbook tree and regenerate
// the landing page (ADR-0059). Ephemeral tool outputs stay gitignored
// (lighthouse-reports/, .coloring-samples/, tools/redteam/output/, …); this
// copies a chosen keeper in so it survives and gets a live GitHub Pages URL.
//
//   node tools/scrapbook/publish-scrapbook.mjs <source> <type>/<name>   publish a file or dir
//   node tools/scrapbook/publish-scrapbook.mjs --index-only             just rebuild index.html
//   node tools/scrapbook/publish-scrapbook.mjs --check                  fail if a collection has no entry page
//
// Cross-platform (ADR-0017): pure node:fs, no shell.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, fail, isMain } from '../lib/proc.mjs';
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
} from './gen-proof-sheet-hub.mjs';

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

const isWithin = (path, parent) => {
  const rel = relative(parent, path);
  return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
};

// A destination is a `<type>/<name>` path inside scrapbook/: never the root itself, never a bare
// type directory, never an escape.
export function resolvePublishDestination(dest, scrapbookDir = SCRAPBOOK_DIR) {
  const destPath = resolve(scrapbookDir, dest);
  const rel = relative(scrapbookDir, destPath);
  if (isAbsolute(dest) || !isWithin(destPath, scrapbookDir) || rel.split(sep).length < 2) {
    throw new Error(`Destination must be <type>/<name> inside scrapbook/: got "${dest}"`);
  }
  return { destPath, rel };
}

const identity = (path) => {
  const { dev, ino } = statSync(path);
  return `${dev}:${ino}`;
};

// Every directory from `path` up to the filesystem root, compared by identity rather than spelling,
// so neither a symlink nor a case-insensitive alias can hide that two paths overlap.
function ancestorIdentities(path) {
  const identities = new Set();
  for (let dir = realpathSync(path); ; dir = dirname(dir)) {
    identities.add(identity(dir));
    if (dirname(dir) === dir) return identities;
  }
}

function nearestExisting(path) {
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  return existing;
}

// Re-publishing a directory replaces it, so a file the new run dropped does not linger in the
// deployed collection. Everything that decides what the removal may reach is checked on the
// filesystem first.
export function replaceWithCopy(srcPath, destPath, scrapbookDir = SCRAPBOOK_DIR) {
  const destAncestors = ancestorIdentities(nearestExisting(destPath));
  if (!destAncestors.has(identity(scrapbookDir))) {
    throw new Error(`Destination resolves outside scrapbook/: ${destPath}`);
  }
  const destOverlapsSource =
    destAncestors.has(identity(srcPath)) ||
    (existsSync(destPath) && ancestorIdentities(srcPath).has(identity(destPath)));
  if (destOverlapsSource) {
    throw new Error(`Source and destination overlap: ${srcPath} → ${destPath}`);
  }
  if (existsSync(destPath)) {
    if (statSync(srcPath).isDirectory() !== statSync(destPath).isDirectory()) {
      throw new Error(`Destination exists as a different kind (file vs directory): ${destPath}`);
    }
    rmSync(destPath, { recursive: true, force: true });
  }
  mkdirSync(dirname(destPath), { recursive: true });
  cpSync(srcPath, destPath, { recursive: true });
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

  let destPath, rel;
  try {
    ({ destPath, rel } = resolvePublishDestination(dest));
    replaceWithCopy(srcPath, destPath);
  } catch (error) {
    fail(error.message);
  }
  writeGeneratedPages();

  const url = PAGES_BASE + rel + (statSync(destPath).isDirectory() ? '/' : '');
  console.log(`Published ${source} → scrapbook/${rel}`);
  console.log(`Live (after Pages deploy): ${url}`);
  console.log(`Index: ${PAGES_BASE}`);
  console.log('Commit & push to publish; the Pages deploy runs on merge to main.');
}

if (isMain(import.meta.url)) main();
