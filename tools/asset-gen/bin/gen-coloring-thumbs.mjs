// Generates a small grid thumbnail for every coloring-book cover and page under
// web/static/coloring/. The Coloring Book Picker shows these images in a grid at
// ~140-300px, but the source art is 1024px+ (a cover is ~84KB, a page ~120KB) —
// 5-8x more pixels than the tile ever paints. Each thumbnail is written beside
// its source as `{name}.thumb.webp` (pen outlines) or `{name}.chalk.thumb.webp`
// (chalk outlines — the dark-mode picker tile) (longest edge THUMB_EDGE, quality
// THUMB_QUALITY), roughly a tenth of the bytes, so the picker renders fast; the
// full-res source stays for the full-screen canvas overlay.
//
// The catalog (web/src/lib/state/books.ts) derives every thumb path from its
// source via `thumbPath()`/`chalkThumbPath()`, and `bookAssetPaths()` lists both
// — so check-assets validates the thumbs and strip-native-assets removes them
// alongside their source. This script is the producer for those paths; keep the
// naming in sync.
//
// Run via npm so it picks up the repo's sharp:
//   npm run gen:coloring-thumbs               regenerate every thumbnail
//   npm run gen:coloring-thumbs -- farm       just one category
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { COLORING_DIR, fail } from '../lib/paths.mjs';

const THUMB_EDGE = 400; // longest-edge px — comfortably covers a 2x DPR ~200px tile
const THUMB_QUALITY = 80;
// Every shipped source image: the `.outline.webp` PEN line art (covers and both
// orientations of each page) plus the `.chalk.webp` CHALK line art (dark-mode
// pages; covers have no chalk yet). The chalk thumb keeps the chalk's
// ink-on-white storage polarity — the picker tile's --lineart-filter invert
// renders it as white chalk, the same treatment the canvas overlay gets. The
// colored fills (.light.webp light + .night.webp dark) are magic-brush
// reveals, never shown in the picker — so they get no thumbnail.
const SOURCE_SUFFIXES = ['.outline.webp', '.chalk.webp'];
const THUMB_SUFFIXES = { '.outline.webp': '.thumb.webp', '.chalk.webp': '.chalk.thumb.webp' };

function isSource(path) {
  return SOURCE_SUFFIXES.some((suffix) => path.endsWith(suffix));
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

const sources = dirs.flatMap((dir) => globSync(join(COLORING_DIR, dir, '*.webp')).filter(isSource));

if (sources.length === 0)
  fail(
    `No source images found under ${COLORING_DIR}${filter.length ? ` for: ${filter.join(', ')}` : ''}.`
  );

let savedTotal = 0;
await Promise.all(
  sources.map(async (src) => {
    const out = thumbTarget(src);
    const before = (await stat(src)).size;
    await sharp(src)
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
