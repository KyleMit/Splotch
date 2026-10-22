// Renders store screenshots and the Play feature graphic from the committed app captures.
// Compositions are served from memory and repository files; no application server is needed.

import { chromium } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { STORE_TARGETS, FEATURE_GRAPHIC } from './lib/storeFrames/targets.ts';
import { STORE_PAGES, pageHasCapture } from './lib/storeFrames/pages.ts';
import { ROOT, isMain } from '../lib/proc.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { openStaticDocument, settleStaticDocument } from './lib/static-document.mjs';
import {
  STORE_FRAME_WEIGHTS,
  featureGraphicDocument,
  storeCaptureFile,
  storeFrameDocument,
  storeFrameFiles,
} from './lib/store-frame-document.mjs';

const OUT = join(ROOT, 'store-assets');
const TABLET7_DIR = 'screenshots/tablet7';

// Screenshots one composition at an exact pixel size.
async function renderDocument(browser, html, width, height, outFile) {
  const opened = await openStaticDocument(browser, {
    html,
    files: storeFrameFiles(),
    viewport: { width, height },
  });
  try {
    await settleStaticDocument(opened, STORE_FRAME_WEIGHTS);
    await opened.page.screenshot({ path: outFile });
  } finally {
    await opened.context.close();
  }
}

export async function generateStoreAssets({ target: onlyTarget = '', page: onlyPage = '' } = {}) {
  const targets = STORE_TARGETS.filter((t) => !onlyTarget || t.name.includes(onlyTarget));
  const pages = STORE_PAGES.filter((p) => !onlyPage || p.id.includes(onlyPage));
  if (targets.length === 0 || pages.length === 0) {
    throw new Error(`No targets or pages match --target=${onlyTarget} --page=${onlyPage}`);
  }
  const fullRun = targets.length === STORE_TARGETS.length && pages.length === STORE_PAGES.length;

  const missing = targets
    .flatMap((t) => pages.filter(pageHasCapture).map((p) => storeCaptureFile(t.name, p.id)))
    .filter((file) => !existsSync(file));
  if (missing.length > 0) {
    throw new Error(`Store frames need committed captures; missing:\n  ${missing.join('\n  ')}`);
  }

  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  try {
    for (const target of targets) {
      mkdirSync(join(OUT, target.dir), { recursive: true });
      for (const page of pages) {
        await renderDocument(
          browser,
          storeFrameDocument(target.name, page.id),
          target.width,
          target.height,
          join(OUT, target.dir, `${page.id}.png`)
        );
        console.log(`${target.name} ${page.id} done`);
      }
    }

    if (fullRun) {
      // Play's 7" tablet slot reuses the 10" images.
      mkdirSync(join(OUT, TABLET7_DIR), { recursive: true });
      for (const page of STORE_PAGES) {
        copyFileSync(
          join(OUT, 'screenshots/tablet10', `${page.id}.png`),
          join(OUT, TABLET7_DIR, `${page.id}.png`)
        );
      }
      console.log('tablet7 copied from tablet10');

      await renderDocument(
        browser,
        featureGraphicDocument(),
        FEATURE_GRAPHIC.width,
        FEATURE_GRAPHIC.height,
        join(OUT, 'feature-graphic.png')
      );
      console.log('feature-graphic done');
    }
  } finally {
    await browser.close();
  }
  console.log('DONE');
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      page: { type: 'string' },
      'frames-only': { type: 'boolean' },
    },
  });
  await generateStoreAssets({ target: values.target ?? '', page: values.page ?? '' });
}
