import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = import.meta.dirname;
const output = join(root, 'contact-sheet');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1504, height: 1200 },
  deviceScaleFactor: 1,
});
await page.goto(`file://${join(root, 'contact-sheet.html')}`);
await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

for (const id of ['spot', 'releases', 'settings-options', 'feedback-policy', 'derived']) {
  await page.locator(`#${id}`).screenshot({ path: join(output, `${id}.png`) });
}

await browser.close();
console.log(`Rendered contact-sheet PNGs to ${output}`);
