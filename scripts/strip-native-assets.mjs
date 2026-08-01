// Prunes the web-only half of the static export so it is never bundled into the
// native (Android/iOS) app. Runs after `vite build` in the `build:cap` script,
// against the freshly produced `build/` output — it never touches the source
// `static/` tree.
//
// Three independent prunes:
//
//   1. Coloring books whose `platforms` field omits 'mobile' (e.g. licensed IP
//      like Bluey / Frozen). Source of truth is src/lib/state/books.ts, matching
//      the runtime filter in ColoringBook.svelte.
//   2. The web-only static files listed in lib/native-export.mjs (social card,
//      favicons, webmanifest, crawler files, generator inputs) — together with
//      the head tags that reference them, so the strip can't leave a 404 behind.
//   3. Full-resolution opaque line-art sources. Runtime presentation uses the
//      generated alpha overlays and picker thumbnails; the opaque files remain
//      committed beside them only as asset-pipeline inputs.
//
// books.ts is TypeScript, so this script is launched with Node's
// --experimental-strip-types (see the build:cap npm script) to import it directly.

import { globSync, readFileSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { nativeUnusedLineArt, webOnlyBooks } from './lib/book-assets.mjs';
import { WEB_ONLY_STATIC_FILES, stripWebOnlyHeadTags } from './lib/native-export.mjs';
import { ROOT, fail } from './lib/proc.mjs';
import { BOOKS, bookAssetPaths } from '../web/src/lib/state/books.ts';

const BUILD_DIR = join(ROOT, 'web', 'build'); // capacitor.config.json webDir

function stripWebOnlyBooks() {
  const webOnly = webOnlyBooks(BOOKS);
  if (webOnly.length === 0) {
    console.log('[strip-native-assets] no web-only books — nothing to strip.');
    return;
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
}

function stripWebOnlyFiles() {
  let freedBytes = 0;
  let removed = 0;
  for (const file of WEB_ONLY_STATIC_FILES) {
    const target = join(BUILD_DIR, file);
    if (!existsSync(target)) {
      // A rename upstream would silently stop saving these bytes, so say so.
      console.warn(`[strip-native-assets] expected but not found: ${file}`);
      continue;
    }
    freedBytes += statSync(target).size;
    rmSync(target);
    removed++;
  }

  // Every page is prerendered from the same app.html, so the favicon/manifest
  // links live in all of them, not just index.html.
  for (const html of globSync('**/*.html', { cwd: BUILD_DIR })) {
    const path = join(BUILD_DIR, html);
    const source = readFileSync(path, 'utf8');
    const stripped = stripWebOnlyHeadTags(source);
    if (stripped !== source) writeFileSync(path, stripped);
  }

  console.log(
    `[strip-native-assets] stripped ${removed} web-only file(s), ` +
      `${(freedBytes / 1024).toFixed(0)} KB freed.`
  );
}

function stripUnusedLineArt() {
  let freedBytes = 0;
  let removed = 0;
  for (const file of nativeUnusedLineArt(BOOKS)) {
    const target = join(BUILD_DIR, file);
    if (!existsSync(target)) {
      console.warn(`[strip-native-assets] expected but not found: ${file}`);
      continue;
    }
    freedBytes += statSync(target).size;
    rmSync(target);
    removed++;
  }
  console.log(
    `[strip-native-assets] stripped ${removed} asset-pipeline line-art source(s), ` +
      `${(freedBytes / 1048576).toFixed(2)} MB freed.`
  );
}

if (!existsSync(BUILD_DIR)) {
  fail(`[strip-native-assets] no build output at ${relative(ROOT, BUILD_DIR)}`);
}

stripWebOnlyBooks();
stripWebOnlyFiles();
stripUnusedLineArt();
