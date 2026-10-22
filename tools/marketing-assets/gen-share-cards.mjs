import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PAGE_SHARE_CARDS, SHARE_CARD_SIZE } from './lib/page/socialCard.ts';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { ROOT } from '../lib/proc.mjs';
import {
  SHARE_CARD_FILES,
  SHARE_CARD_WEIGHTS,
  readShareCard,
  shareCardDocument,
  shareCardProblems,
} from './lib/share-card-document.mjs';
import { shareCardInputHash } from './lib/share-card-inputs.mjs';
import { openStaticDocument, settleStaticDocument } from './lib/static-document.mjs';

const MAX_CARD_BYTES = 300_000;
const HASH_LENGTH = 8;
const OUTPUT_DIR = join(ROOT, 'assets/static/share');
const HASH_FILE = join(ROOT, 'tools/marketing-assets/lib/page/shareCards.json');
const INPUT_HASH_FILE = join(ROOT, 'tools/marketing-assets/lib/page/shareCardInputs.json');
const inputSha256 = shareCardInputHash();

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
try {
  const hashes = {};
  const captures = [];
  for (const [path, card] of Object.entries(PAGE_SHARE_CARDS)) {
    const opened = await openStaticDocument(browser, {
      html: shareCardDocument(path),
      files: SHARE_CARD_FILES,
      viewport: SHARE_CARD_SIZE,
    });
    try {
      await settleStaticDocument(opened, SHARE_CARD_WEIGHTS);
      const problems = shareCardProblems(card, await opened.page.evaluate(readShareCard));
      if (problems.length) throw new Error(`${card.file}: ${problems.join('; ')}`);
      const screenshot = await opened.page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, ...SHARE_CARD_SIZE },
      });
      const png = await sharp(screenshot).png({ compressionLevel: 9 }).toBuffer();
      if (png.length >= MAX_CARD_BYTES)
        throw new Error(`${card.file} exceeds ${MAX_CARD_BYTES} bytes`);
      captures.push({ file: card.file, png });
      hashes[card.file] = createHash('sha256').update(png).digest('hex').slice(0, HASH_LENGTH);
      console.log(`${card.file}: ${png.length} bytes, ${hashes[card.file]}`);
    } finally {
      await opened.context.close();
    }
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const { file, png } of captures) writeFileSync(join(OUTPUT_DIR, file), png);
  writeFileSync(HASH_FILE, `${JSON.stringify(hashes, null, 2)}\n`);
  writeFileSync(INPUT_HASH_FILE, `${JSON.stringify({ inputSha256 }, null, 2)}\n`);
} finally {
  await browser.close();
}
