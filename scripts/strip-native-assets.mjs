// Removes web-only coloring-book assets from the static export so they are
// never bundled into the native (Android/iOS) app. Runs after `vite build` in
// the `build:cap` script, against the freshly produced `build/` output — it
// never touches the source `static/` tree.
//
// Source of truth is the `platforms` field in src/lib/state/books.ts. A book
// that does not list 'mobile' (e.g. licensed IP like Bluey / Frozen) has its
// asset folder deleted here, matching the runtime filter in ColoringBook.svelte.
//
// books.ts is TypeScript, so this script is launched with Node's
// --experimental-strip-types (see the build:cap npm script) to import it directly.

import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, webOnlyBooks } from './lib/utils.mjs';
import { BOOKS, bookAssetPaths } from '../web/src/lib/state/books.ts';

const BUILD_DIR = join(ROOT, 'web', 'build'); // capacitor.config.json webDir

const webOnly = webOnlyBooks(BOOKS);
if (webOnly.length === 0) {
  console.log('[strip-native-assets] no web-only books — nothing to strip.');
  process.exit(0);
}

// Each book's assets live under one folder (derived from its asset paths, so we
// stay correct even if a folder name ever diverges from the book id).
const dirs = new Set(webOnly.flatMap((book) => bookAssetPaths(book).map((p) => dirname(p))));

let removed = 0;
for (const dir of dirs) {
  const target = join(BUILD_DIR, dir);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`[strip-native-assets] removed ${dir}`);
    removed++;
  } else {
    console.warn(`[strip-native-assets] expected but not found: ${dir}`);
  }
}

console.log(
  `[strip-native-assets] stripped ${removed} folder(s) for ${webOnly.length} web-only book(s): ` +
    webOnly.map((b) => b.id).join(', ')
);
