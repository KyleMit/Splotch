import { existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { allSurfaces } from './gen-page-inventory.mjs';
import {
  pixelIdenticalReviewGroups,
  readCaptureManifest,
  readDesignCritique,
  sha256File,
} from './lib/page-inventory-data.mjs';
import {
  attachExpectedCapturePaths,
  renderPageInventoryReport,
} from './lib/page-inventory-report.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const OUT_DEFAULT = join(ROOT, 'scrapbook/page-inventory');

function options(argv) {
  const parsed = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', default: OUT_DEFAULT },
      critique: { type: 'string' },
    },
    strict: true,
  }).values;
  const out = resolve(ROOT, parsed.out);
  const scrapbook = resolve(ROOT, 'scrapbook');
  if (!out.startsWith(`${scrapbook}${sep}`)) {
    throw new Error(`--out must stay inside scrapbook/: ${parsed.out}`);
  }
  const defaultCritique = join(out, 'design-critique.json');
  const critique = parsed.critique ? resolve(ROOT, parsed.critique) : defaultCritique;
  if (parsed.critique && !existsSync(critique)) {
    throw new Error(`--critique does not exist: ${parsed.critique}`);
  }
  return { out, critique: existsSync(critique) ? critique : undefined };
}

export function attachPageInventoryFeedback(argv = process.argv.slice(2)) {
  const { out, critique: critiquePath } = options(argv);
  const items = attachExpectedCapturePaths(allSurfaces());
  const critiqueCount = writePageInventoryFeedback(out, critiquePath, items);
  console.log(
    `Attached ${critiqueCount} feedback entr${critiqueCount === 1 ? 'y' : 'ies'} to ${relative(ROOT, join(out, 'index.html'))}`
  );
}

export function writePageInventoryFeedback(out, critiquePath, items) {
  const manifestPath = join(out, 'capture-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('Page inventory has no capture-manifest.json; run npm run gen:page-inventory');
  }
  const manifest = readCaptureManifest(manifestPath);
  const expectedImages = items.flatMap((item) => Object.values(item.captures));
  const manifestImages = new Set(manifest.captures.map((capture) => capture.image));
  const missingManifestEntries = expectedImages.filter((image) => !manifestImages.has(image));
  const unknownManifestEntries = manifest.captures.filter(
    (capture) => !expectedImages.includes(capture.image)
  );
  if (missingManifestEntries.length || unknownManifestEntries.length) {
    const mismatch = missingManifestEntries[0] ?? unknownManifestEntries[0].image;
    throw new Error(`Capture manifest disagrees with the current inventory: ${mismatch}`);
  }
  const missingImages = manifest.captures.filter(
    (capture) => !existsSync(join(out, capture.image))
  );
  if (missingImages.length) {
    throw new Error(
      `Page inventory is missing ${missingImages.length} expected image${missingImages.length === 1 ? '' : 's'}; run npm run gen:page-inventory first: ${missingImages[0].image}`
    );
  }
  for (const capture of manifest.captures) {
    if (sha256File(join(out, capture.image)) !== capture.sha256) {
      throw new Error(`Capture manifest has a stale image hash for ${capture.image}`);
    }
  }
  const critique = readDesignCritique(critiquePath, manifest);
  const index = join(out, 'index.html');
  writeFileSync(
    index,
    renderPageInventoryReport(
      items,
      critique,
      pixelIdenticalReviewGroups(manifest.captures, critique)
    )
  );
  return critique.size;
}

if (isMain(import.meta.url)) {
  runMain(() => Promise.resolve().then(() => attachPageInventoryFeedback()));
}
