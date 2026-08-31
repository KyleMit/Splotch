// Prunes the web-only half of the static export so it is never bundled into the
// native (Android/iOS) app. Runs after `vite build` in the `build:cap` script,
// against the freshly produced `build/` output — it never touches the source
// `static/` tree.
//
// Five independent prunes:
//
//   1. Coloring books whose `platforms` field omits 'mobile' (e.g. licensed IP
//      like Bluey / Frozen). Source of truth is src/lib/state/books.ts, matching
//      the runtime filter in ColoringBook.svelte.
//   2. Every mobile coloring book except the starter book. These are installed
//      as verified background downloads after the app opens.
//   3. The web-only static files listed in lib/static-export.mjs (social card,
//      favicons, webmanifest, crawler files, generator inputs) — together with
//      the head tags that reference them, so the strip can't leave a 404 behind.
//   4. Cover SVG masters. Runtime cover presentation uses their raster thumbnails;
//      page SVGs remain because presentation and export both use them.
//   5. Hosted responsive tiers. Native downloads its selected pack tier after install.
//
// books.ts is TypeScript, so this script is launched with Node's
// --experimental-strip-types (see the build:cap npm script) to import it directly.

import { globSync, readFileSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  downloadableMobileBooks,
  nativeUnusedCoverLineArt,
  webOnlyBooks,
} from '../lib/coloring-book-assets.mjs';
import { WEB_ONLY_STATIC_FILES, stripWebOnlyHeadTags } from './lib/static-export.mjs';
import { ROOT, fail, isMain } from '../lib/proc.mjs';
import {
  BOOKS,
  RESPONSIVE_COLORING_TIER_DIRECTORIES,
  STARTER_COLORING_BOOK_ID,
  bookAssetPaths,
} from '../../web/src/lib/state/books.ts';

const BUILD_DIR = join(ROOT, 'web', 'build'); // capacitor.config.json webDir

function displayBuildPath(buildDir) {
  const absoluteBuildDir = resolve(buildDir);
  const repoRelative = relative(ROOT, absoluteBuildDir);
  const outsideRoot =
    repoRelative === '..' || repoRelative.startsWith(`..${sep}`) || isAbsolute(repoRelative);
  return outsideRoot ? absoluteBuildDir : repoRelative || '.';
}

function stripWebOnlyBooks(buildDir, books) {
  const webOnly = webOnlyBooks(books);
  if (webOnly.length === 0) {
    console.log('[strip-static-assets] no web-only books — nothing to strip.');
    return;
  }

  // Responsive roots are removed wholesale below; this pass owns only each
  // web-only book's canonical folder(s).
  const dirs = new Set(
    webOnly.flatMap((book) =>
      bookAssetPaths(book)
        .filter(
          (path) =>
            !RESPONSIVE_COLORING_TIER_DIRECTORIES.some((tier) => path.startsWith(`${tier}/`))
        )
        .map((path) => dirname(path))
    )
  );

  let removed = 0;
  for (const dir of dirs) {
    const target = join(buildDir, dir);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      console.log(`[strip-static-assets] removed ${dir}`);
      removed++;
    } else {
      console.warn(`[strip-static-assets] expected but not found: ${dir}`);
    }
  }

  console.log(
    `[strip-static-assets] stripped ${removed}/${dirs.size} canonical folder(s) for ` +
      `${webOnly.length} web-only book(s): ` +
      webOnly.map((b) => b.id).join(', ')
  );
}

function stripWebOnlyFiles(buildDir) {
  let freedBytes = 0;
  let removed = 0;
  for (const file of WEB_ONLY_STATIC_FILES) {
    const target = join(buildDir, file);
    if (!existsSync(target)) {
      // A rename upstream would silently stop saving these bytes, so say so.
      console.warn(`[strip-static-assets] expected but not found: ${file}`);
      continue;
    }
    freedBytes += statSync(target).size;
    rmSync(target);
    removed++;
  }

  // Every page is prerendered from the same app.html, so the favicon/manifest
  // links live in all of them, not just index.html.
  for (const html of globSync('**/*.html', { cwd: buildDir })) {
    const path = join(buildDir, html);
    const source = readFileSync(path, 'utf8');
    const stripped = stripWebOnlyHeadTags(source);
    if (stripped !== source) writeFileSync(path, stripped);
  }

  console.log(
    `[strip-static-assets] stripped ${removed} web-only file(s), ` +
      `${(freedBytes / 1024).toFixed(0)} KB freed.`
  );
}

function stripDownloadableBooks(buildDir, books) {
  const downloadable = downloadableMobileBooks(books, STARTER_COLORING_BOOK_ID);
  let freedBytes = 0;
  let removed = 0;
  for (const book of downloadable) {
    const directory = join(buildDir, 'coloring', book.id);
    if (!existsSync(directory)) {
      console.warn(`[strip-static-assets] expected but not found: /coloring/${book.id}`);
      continue;
    }
    for (const file of globSync('**/*', { cwd: directory })) {
      const path = join(directory, file);
      const stats = statSync(path);
      if (stats.isFile()) freedBytes += stats.size;
    }
    rmSync(directory, { recursive: true, force: true });
    removed++;
  }
  console.log(
    `[strip-static-assets] stripped ${removed}/${downloadable.length} downloadable coloring book(s), ` +
      `${(freedBytes / 1048576).toFixed(2)} MB freed.`
  );
}

function stripUnusedCoverLineArt(buildDir, books) {
  let freedBytes = 0;
  let removed = 0;
  for (const file of nativeUnusedCoverLineArt(books)) {
    const target = join(buildDir, file);
    if (!existsSync(target)) {
      console.warn(`[strip-static-assets] expected but not found: ${file}`);
      continue;
    }
    freedBytes += statSync(target).size;
    rmSync(target);
    removed++;
  }
  console.log(
    `[strip-static-assets] stripped ${removed} asset-pipeline cover source(s), ` +
      `${(freedBytes / 1048576).toFixed(2)} MB freed.`
  );
}

function stripResponsiveColoringTiers(buildDir) {
  let removed = 0;
  for (const directory of RESPONSIVE_COLORING_TIER_DIRECTORIES) {
    const target = join(buildDir, directory);
    if (!existsSync(target)) {
      console.warn(`[strip-static-assets] expected but not found: ${directory}`);
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    removed++;
  }
  console.log(
    `[strip-static-assets] stripped ${removed}/${RESPONSIVE_COLORING_TIER_DIRECTORIES.length} ` +
      'web-responsive coloring tier root(s).'
  );
}

export function stripStaticAssets(buildDir, books) {
  if (!existsSync(buildDir)) {
    throw new Error(`[strip-static-assets] no build output at ${displayBuildPath(buildDir)}`);
  }

  stripWebOnlyBooks(buildDir, books);
  stripDownloadableBooks(buildDir, books);
  stripWebOnlyFiles(buildDir);
  const starterBooks = books.filter((book) => book.id === STARTER_COLORING_BOOK_ID);
  stripUnusedCoverLineArt(buildDir, starterBooks);
  stripResponsiveColoringTiers(buildDir);
}

if (isMain(import.meta.url)) {
  try {
    stripStaticAssets(BUILD_DIR, BOOKS);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
