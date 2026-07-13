// Idea 20 measurement: real rendered size of coloring art across device profiles.
// Connects to the driver's dev server (http://localhost:5199), emulates each
// profile, applies a Creatures coloring page, and measures the overlay art box,
// DPR, and the engine's canvas backing store.
import { chromium } from 'playwright';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';

function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = `${base}/${build}/${sub}/chrome`;
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

const profiles = [
  { name: 'phone-2x-portrait (iPhone SE)', w: 375, h: 667, dpr: 2, touch: true },
  { name: 'phone-3x-portrait (iPhone 15)', w: 393, h: 852, dpr: 3, touch: true },
  { name: 'phone-3x-landscape (iPhone 15)', w: 852, h: 393, dpr: 3, touch: true },
  { name: 'phone-3x-landscape (iPhone 16 Pro Max)', w: 932, h: 430, dpr: 3, touch: true },
  { name: 'phone-2.6x-portrait (Pixel 8)', w: 412, h: 915, dpr: 2.625, touch: true },
  { name: 'tablet-2x-landscape (Pixel Tablet / Tab S9)', w: 1280, h: 800, dpr: 2, touch: true },
  { name: 'tablet-2x-landscape (iPad Air 11)', w: 1180, h: 820, dpr: 2, touch: true },
  { name: 'tablet-2x-landscape (iPad Pro 13)', w: 1366, h: 1024, dpr: 2, touch: true },
  { name: 'tablet-2x-portrait (iPad Pro 13)', w: 1024, h: 1366, dpr: 2, touch: true },
];

const browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
const results = [];

for (const p of profiles) {
  const context = await browser.newContext({
    viewport: { width: p.w, height: p.h },
    deviceScaleFactor: p.dpr,
    hasTouch: p.touch,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('http://localhost:5199/', { waitUntil: 'commit' });
  await page.waitForFunction(() => {
    const c = document.getElementById('drawingCanvas');
    return !!c && c.width > 300;
  });
  await page.locator('button[aria-label="Expand controls"]').click();
  await page.locator('#coloringBookButton').waitFor({ state: 'visible' });
  await page.locator('#coloringBookButton').click();
  const dialog = page.locator('#coloring-book-dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: /Creatures coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Creatures coloring page/i })
    .first()
    .click();
  const overlay = page.locator('#coloringOverlay');
  await overlay.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const img = document.getElementById('coloringOverlay');
    return !!img && img.naturalWidth > 0 && /outline\.webp$/.test(img.src);
  });
  const m = await page.evaluate(() => {
    const img = document.getElementById('coloringOverlay');
    const rect = img.getBoundingClientRect();
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.min(rect.width / iw, rect.height / ih);
    const canvas = document.getElementById('drawingCanvas');
    const crect = canvas.getBoundingClientRect();
    return {
      src: img.src.split('/').slice(-1)[0],
      natural: { w: iw, h: ih },
      imgElCss: { w: rect.width, h: rect.height },
      artBoxCss: { w: iw * scale, h: ih * scale },
      dpr: window.devicePixelRatio,
      canvasCss: { w: crect.width, h: crect.height },
      canvasBacking: { w: canvas.width, h: canvas.height },
    };
  });
  const renderScale = m.canvasBacking.w / m.canvasCss.w;
  const artDeviceW = m.artBoxCss.w * m.dpr;
  const artDeviceH = m.artBoxCss.h * m.dpr;
  const artPaperW = m.artBoxCss.w * renderScale;
  const artPaperH = m.artBoxCss.h * renderScale;
  results.push({
    profile: p.name,
    viewport: `${p.w}x${p.h}@${p.dpr}`,
    asset: m.src,
    assetPx: `${m.natural.w}x${m.natural.h}`,
    artBoxCss: `${m.artBoxCss.w.toFixed(0)}x${m.artBoxCss.h.toFixed(0)}`,
    outlineDisplayDevicePx: `${artDeviceW.toFixed(0)}x${artDeviceH.toFixed(0)}`,
    outlineScaleVsNative: +(artDeviceW / m.natural.w).toFixed(3),
    renderScale: +renderScale.toFixed(3),
    fillSheetPx: `${artPaperW.toFixed(0)}x${artPaperH.toFixed(0)}`,
    fillScaleVsNative: +(artPaperW / m.natural.w).toFixed(3),
  });
  console.log(JSON.stringify(results[results.length - 1]));
  await context.close();
}

await browser.close();
writeFileSync(process.env.IDEA_OUT || '/dev/null', JSON.stringify(results, null, 2));
