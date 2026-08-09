import { existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { allSurfaces } from './gen-page-inventory.mjs';
import {
  attachExpectedCapturePaths,
  readDesignCritique,
  renderPageInventoryReport,
} from './lib/page-inventory-report.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

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

export async function attachPageInventoryFeedback(argv = process.argv.slice(2)) {
  const { out, critique: critiquePath } = options(argv);
  const items = attachExpectedCapturePaths(allSurfaces());
  const critiqueCount = writePageInventoryFeedback(out, critiquePath, items);
  console.log(
    `Attached ${critiqueCount} feedback entr${critiqueCount === 1 ? 'y' : 'ies'} to ${relative(ROOT, join(out, 'index.html'))}`
  );
}

export function writePageInventoryFeedback(out, critiquePath, items) {
  const expectedImages = items.flatMap((item) => Object.values(item.captures));
  const missingImages = expectedImages.filter((image) => !existsSync(join(out, image)));
  if (missingImages.length) {
    throw new Error(
      `Page inventory is missing ${missingImages.length} expected image${missingImages.length === 1 ? '' : 's'}; run npm run gen:page-inventory first: ${missingImages[0]}`
    );
  }
  const critique = readDesignCritique(critiquePath, expectedImages);
  const index = join(out, 'index.html');
  writeFileSync(index, renderPageInventoryReport(items, critique));
  return critique.size;
}

if (isMain(import.meta.url)) runMain(attachPageInventoryFeedback);
