#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, sleep } from '../../../scripts/lib/proc.mjs';
import { chromiumExecutablePath } from '../../../scripts/lib/playwright.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
} from '../../../scripts/lib/app-driver.mjs';
import { drawHouseTall, drawHouseWide } from '../generated/store-drawings.mjs';

const DEFAULT_OUTPUT = join(ROOT, 'screenshots/store-drawing-review');
const PORT = 4173;
const SCREENSHOT_SETTLE_DELAY_MS = 750;
const BRUSHES = ['pen', 'crayon', 'magic'];
const TARGETS = [
  {
    name: 'google-play-phone',
    device: { width: 432, height: 768, deviceScaleFactor: 2.5 },
    drawing: 'house-tall',
    draw: drawHouseTall,
  },
  {
    name: 'google-play-tablet',
    device: { width: 1280, height: 720, deviceScaleFactor: 1.5 },
    drawing: 'house-wide',
    draw: drawHouseWide,
  },
];

function reviewHtml(records) {
  const cards = records
    .map(
      ({ target, brush, drawing, filename, pixels }) => `<figure>
        <a href="${filename}"><img src="${filename}" alt="${target}, ${brush}" loading="lazy"></a>
        <figcaption><strong>${target}</strong><span>${drawing} · ${brush} · ${pixels}</span></figcaption>
      </figure>`
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Store drawing brush review</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; background: #f6f3f8; color: #312a38; }
    body { margin: 0 auto; max-width: 1500px; padding: 32px; }
    h1 { margin: 0 0 8px; }
    p { margin: 0 0 28px; color: #685d71; }
    main { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; align-items: start; }
    figure { margin: 0; padding: 14px; border-radius: 18px; background: white; box-shadow: 0 6px 24px #513d6214; }
    img { display: block; width: 100%; height: auto; border-radius: 10px; }
    figcaption { display: flex; flex-direction: column; gap: 4px; padding-top: 12px; }
    figcaption span { color: #74687e; font-size: 14px; }
    @media (max-width: 850px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Store drawing brush review</h1>
  <p>Review-only captures from static pointer instructions. Shipping store assets were not changed.</p>
  <main>${cards}</main>
</body>
</html>`;
}

async function capture(browser, base, output, target, brush) {
  const { ctx, page } = await openAppPage(browser, base, target.device);
  try {
    await expandDrawer(page);
    const box = await canvasBox(page);
    await target.draw(page, box, { brush });
    await sleep(SCREENSHOT_SETTLE_DELAY_MS);
    const filename = `${target.name}-${brush}.png`;
    await page.screenshot({ path: join(output, filename) });
    const pixels = `${target.device.width * target.device.deviceScaleFactor}×${target.device.height * target.device.deviceScaleFactor}`;
    console.log(`${filename}: ${pixels}`);
    return { target: target.name, brush, drawing: target.drawing, filename, pixels };
  } finally {
    await ctx.close();
  }
}

export async function generateStoreDrawingReview(output = DEFAULT_OUTPUT) {
  await mkdir(output, { recursive: true });
  const server = await ensureDevServer(PORT);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
    const base = `http://localhost:${PORT}/`;
    const records = [];
    for (const target of TARGETS) {
      for (const brush of BRUSHES)
        records.push(await capture(browser, base, output, target, brush));
    }
    await writeFile(join(output, 'index.html'), reviewHtml(records));
    await writeFile(join(output, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`);
    return records;
  } finally {
    if (browser) await browser.close();
    server.stop();
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { output: { type: 'string', short: 'o' } },
  });
  const output = resolve(values.output ?? DEFAULT_OUTPUT);
  await generateStoreDrawingReview(output);
  console.log(`Review gallery: ${join(output, 'index.html')}`);
}
