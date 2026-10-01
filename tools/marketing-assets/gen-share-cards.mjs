import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  PAGE_SHARE_CARDS,
  SHARE_CARD_PATH_PARAM,
  SHARE_CARD_SIZE,
} from '../../web/src/lib/components/page/socialCard.ts';
import { QUICKSAND_FONT_FAMILY } from '../../web/src/lib/fonts.ts';
import { ensureDevServer, openAppPage } from '../app-driver/lib/app-driver.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { ROOT } from '../lib/proc.mjs';

const PORT = 5300;
const MAX_CARD_BYTES = 300_000;
const HASH_LENGTH = 8;
const OUTPUT_DIR = join(ROOT, 'web/static/share');
const HASH_FILE = join(ROOT, 'web/src/lib/components/page/shareCards.json');
const DEVICE = { ...SHARE_CARD_SIZE, deviceScaleFactor: 1 };

async function waitForCardAssets(page) {
  await page.evaluate(async (family) => {
    const fonts = await document.fonts.load(`700 120px "${family}"`);
    if (!fonts.length) throw new Error(`Card font did not load: ${family}`);
    await document.fonts.ready;
    const paper = document.querySelector('.share-card .paper');
    if (!paper) throw new Error('Missing share-card paper');
    const background = getComputedStyle(paper).backgroundImage;
    const source = /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
    if (!source) throw new Error('Missing share-card paper texture');
    const texture = new Image();
    texture.src = source;
    await texture.decode();
    await Promise.all([...document.querySelectorAll('.share-card img')].map((img) => img.decode()));
  }, QUICKSAND_FONT_FAMILY);
}

const { base, stop } = await ensureDevServer(PORT);
let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const { ctx, page } = await openAppPage(browser, base, DEVICE);
  const hashes = {};
  const captures = [];
  for (const [path, card] of Object.entries(PAGE_SHARE_CARDS)) {
    const url = new URL('/dev/share-cards', base);
    url.searchParams.set(SHARE_CARD_PATH_PARAM, path);
    const response = await page.goto(url.href, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`Share-card harness failed: ${path}`);
    await waitForCardAssets(page);
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, ...SHARE_CARD_SIZE },
    });
    const png = await sharp(screenshot).png({ compressionLevel: 9 }).toBuffer();
    if (png.length >= MAX_CARD_BYTES)
      throw new Error(`${card.file} exceeds ${MAX_CARD_BYTES} bytes`);
    captures.push({ file: card.file, png });
    hashes[card.file] = createHash('sha256').update(png).digest('hex').slice(0, HASH_LENGTH);
    console.log(`${card.file}: ${png.length} bytes, ${hashes[card.file]}`);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const { file, png } of captures) writeFileSync(join(OUTPUT_DIR, file), png);
  writeFileSync(HASH_FILE, `${JSON.stringify(hashes, null, 2)}\n`);
  await ctx.close();
} finally {
  await browser?.close();
  stop();
}
