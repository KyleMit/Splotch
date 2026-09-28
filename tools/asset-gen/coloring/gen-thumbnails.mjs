// Generates a small grid thumbnail for every coloring-book cover under
// web/static/coloring/. Page tiles reuse their transparent SVG presentation overlays.
//
// The catalog (web/src/lib/state/books.ts) derives both cover paths and lists them through
// `bookAssetPaths()`, so check:coloring-assets validates the files and native asset stripping
// follows the same inventory.
//
// Run via npm so it picks up the repo's sharp:
//   npm run gen:coloring-thumbs               regenerate every thumbnail
//   npm run gen:coloring-thumbs -- farm       just one category
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { fail } from '../lib/asset-cli.mjs';
import { COLORING_DIR } from '../lib/asset-paths.mjs';
import { rasterizeLineArt } from '../lib/line-art.mjs';

const THUMB_EDGE = 400; // longest-edge px — comfortably covers a 2x DPR ~200px tile
const THUMB_QUALITY = 80;
const THUMB_FOR_SOURCE = {
  'cover.overlay.svg': 'cover.thumb.webp',
  'cover.dark.overlay.svg': 'cover.chalk.thumb.webp',
};

const coverSources = (category) =>
  Object.keys(THUMB_FOR_SOURCE)
    .filter((file) => existsSync(join(COLORING_DIR, category, file)))
    .map((file) => ({ category, file }));

// A category is any coloring folder with cover line art; the responsive max-* tiers have none.
const { positionals: requested } = parseArgs({ allowPositionals: true });
const categories = (await readdir(COLORING_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && coverSources(entry.name).length > 0)
  .map((entry) => entry.name);
const unknown = requested.filter((category) => !categories.includes(category));
if (unknown.length > 0)
  fail(`Unknown coloring category: ${unknown.join(', ')} — categories: ${categories.join(', ')}`);

const sources = (requested.length > 0 ? requested : categories).flatMap(coverSources);
if (sources.length === 0) fail(`No cover line art found under ${COLORING_DIR}.`);

await Promise.all(
  sources.map(async ({ category, file }) => {
    await sharp(await rasterizeLineArt(join(COLORING_DIR, category, file)))
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(join(COLORING_DIR, category, THUMB_FOR_SOURCE[file]));
  })
);

console.log(`[gen:coloring-thumbs] wrote ${sources.length} thumbnail(s).`);
