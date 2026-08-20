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
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { fail } from '../lib/asset-cli.mjs';
import { COLORING_DIR } from '../lib/asset-paths.mjs';
import { rasterizeLineArt } from '../lib/line-art.mjs';

const THUMB_EDGE = 400; // longest-edge px — comfortably covers a 2x DPR ~200px tile
const THUMB_QUALITY = 80;
const SOURCE_FILES = ['cover.overlay.svg', 'cover.dark.overlay.svg'];
const SOURCE_SUFFIXES = ['.dark.overlay.svg', '.overlay.svg'];
const THUMB_SUFFIXES = {
  '.overlay.svg': '.thumb.webp',
  '.dark.overlay.svg': '.chalk.thumb.webp',
};

function isCoverSource(path) {
  return SOURCE_FILES.some((file) => path.endsWith(`/${file}`));
}

function thumbTarget(src) {
  const suffix = SOURCE_SUFFIXES.find((s) => src.endsWith(s));
  return src.slice(0, -suffix.length) + THUMB_SUFFIXES[suffix];
}

const filter = process.argv.slice(2);
const dirs = filter.length
  ? filter
  : (await readdir(COLORING_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

const sources = dirs.flatMap((dir) =>
  globSync(join(COLORING_DIR, dir, '*.svg')).filter(isCoverSource)
);

if (sources.length === 0)
  fail(
    `No source images found under ${COLORING_DIR}${filter.length ? ` for: ${filter.join(', ')}` : ''}.`
  );

let savedTotal = 0;
await Promise.all(
  sources.map(async (src) => {
    const out = thumbTarget(src);
    const before = (await stat(src)).size;
    await sharp(await rasterizeLineArt(src))
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(out);
    const after = (await stat(out)).size;
    savedTotal += before - after;
  })
);

console.log(
  `[gen:coloring-thumbs] wrote ${sources.length} thumbnail(s) — saved ${(savedTotal / 1048576).toFixed(2)} MB vs. full-res.`
);
