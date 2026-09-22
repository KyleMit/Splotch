// Phase 2 of the UI harmonization pass (issue 1020): one tiled image per UI
// concept, made of element-level crops of every instance across every surface
// the page inventory knows how to open, in both themes, with the computed style
// each instance actually resolved to. Side by side, divergence is visible; the
// computed-style dump says exactly what diverged.
//
//   node tools/harmonize/concept-contact-sheet.mjs --url http://localhost:5211 --out screenshots/harmonize
//
// Reuses the page inventory's surface preparations (allSurfaces) so the set of
// surfaces is the one the inventory already declares, not a second list.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { allSurfaces } from '../page-inventory/capture-page-inventory.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5211' },
    out: { type: 'string', default: 'screenshots/harmonize' },
    viewport: { type: 'string', default: 'phone' },
    surface: { type: 'string', multiple: true },
  },
});

const VIEWPORTS = {
  phone: { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 2 },
};

// Each concept is a selector for the *control* whose treatment should be one
// canonical form. The glyph selectors climb to the nearest interactive ancestor
// so the crop shows the disc/button the glyph sits in, not just the glyph.
const CONCEPTS = {
  close: {
    selector:
      '.modal-close-btn, .dialog-header-control, .banner-dismiss, button[aria-label="Close"], button[aria-label*="Dismiss" i], button[aria-label*="close" i]',
  },
  chevron: { selector: '[data-icon^="chevron"]', climb: 'button, summary, a, [role="button"]' },
  'brand-button': { selector: '.btn.brand, button.brand, .button.brand, [class*="btn-brand"]' },
};

const STYLE_PROPS = [
  'width',
  'height',
  'border-radius',
  'border-top-width',
  'border-top-color',
  'background-color',
  'box-shadow',
  'padding-top',
  'opacity',
];

const TILE = 120;
const LABEL_H = 34;
const COLS = 6;
const CROP_PAD = 6;

const STORAGE = {
  'splotch-ai-access-token': 'daycare-club',
  'splotch-ai-image-enabled': 'true',
  'splotch-tool-drawer-enabled': 'true',
  'splotch-drawer-open': 'false',
  'splotch-install-dismissed': 'false',
  'splotch-install-completed': 'false',
  'splotch-parental-gate-ai-image-mode': 'never',
  'splotch-parental-gate-image-report-mode': 'never',
  'splotch-parental-gate-external-links-mode': 'never',
  'splotch-parental-gate-feedback-mode': 'never',
  'splotch-parental-gate-parent-center-mode': 'never',
};

async function collect(page, surfaceId, theme, records) {
  for (const [concept, { selector, climb }] of Object.entries(CONCEPTS)) {
    const instances = await page.evaluate(
      ({ selector, climb, props }) => {
        const seen = new Set();
        const out = [];
        for (let el of document.querySelectorAll(selector)) {
          if (climb) el = el.closest(climb) ?? el;
          if (seen.has(el)) continue;
          seen.add(el);
          const box = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (box.width === 0 || box.height === 0 || cs.visibility === 'hidden') continue;
          // Only the topmost surface: an element under a dialog scrim is not what the user sees.
          const probe = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          if (probe && !el.contains(probe) && !probe.contains(el)) continue;
          const svg = el.querySelector('svg');
          const style = Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
          style['svg-fill'] = svg ? getComputedStyle(svg).fill : '';
          style['icon'] = el.querySelector('[data-icon]')?.dataset.icon ?? el.dataset.icon ?? '';
          out.push({
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
            className: el.className?.baseVal ?? String(el.className),
            style,
          });
        }
        return out;
      },
      { selector, climb, props: STYLE_PROPS }
    );
    for (const [i, inst] of instances.entries()) {
      const clip = {
        x: Math.max(0, inst.box.x - CROP_PAD),
        y: Math.max(0, inst.box.y - CROP_PAD),
        width: inst.box.width + CROP_PAD * 2,
        height: inst.box.height + CROP_PAD * 2,
      };
      const png = await page.screenshot({ clip }).catch(() => null);
      if (!png) continue;
      records.push({ concept, theme, surface: surfaceId, index: i, ...inst, png });
    }
  }
}

async function composeSheet(concept, theme, items, out) {
  if (!items.length) return null;
  const rows = Math.ceil(items.length / COLS);
  const width = COLS * TILE;
  const height = rows * (TILE + LABEL_H) + 40;
  const bg = theme === 'dark' ? '#1b1a22' : '#ffffff';
  const ink = theme === 'dark' ? '#dedce8' : '#1f1f1f';
  const composites = [];
  const labels = [];
  for (const [i, item] of items.entries()) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const meta = await sharp(item.png).metadata();
    const scale = Math.min((TILE - 12) / meta.width, (TILE - 12) / meta.height, 1);
    const tile = await sharp(item.png)
      .resize(
        Math.max(1, Math.round(meta.width * scale)),
        Math.max(1, Math.round(meta.height * scale))
      )
      .png()
      .toBuffer();
    const tm = await sharp(tile).metadata();
    composites.push({
      input: tile,
      left: col * TILE + Math.round((TILE - tm.width) / 2),
      top: 40 + row * (TILE + LABEL_H) + Math.round((TILE - tm.height) / 2),
    });
    const r = item.style['border-radius'].split(' ')[0];
    labels.push(
      `<text x="${col * TILE + 4}" y="${40 + row * (TILE + LABEL_H) + TILE + 12}" font-size="10" fill="${ink}" font-family="sans-serif">${escape(item.surface)}</text>` +
        `<text x="${col * TILE + 4}" y="${40 + row * (TILE + LABEL_H) + TILE + 24}" font-size="9" fill="${ink}" font-family="sans-serif" opacity="0.7">${escape(`${Math.round(item.box.width)}×${Math.round(item.box.height)} r${r} ${item.style.icon}`)}</text>`
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/><text x="8" y="24" font-size="14" font-weight="bold" fill="${ink}" font-family="sans-serif">${escape(`${concept} · ${theme} · ${args.viewport} · ${items.length} instances`)}</text>${labels.join('')}</svg>`;
  const path = join(out, `${concept}-${theme}-${args.viewport}.png`);
  await sharp(Buffer.from(svg)).composite(composites).png().toFile(path);
  return path;
}

const escape = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
const out = args.out;
mkdirSync(out, { recursive: true });
const records = [];
const surfaces = allSurfaces().filter(
  (s) => !s.group.startsWith('admin') && (!args.surface || args.surface.includes(s.id))
);
const failures = [];
for (const theme of ['light', 'dark']) {
  const { width, height, ...device } = VIEWPORTS[args.viewport];
  const context = await browser.newContext({
    viewport: { width, height },
    ...device,
    baseURL: args.url,
    colorScheme: theme,
  });
  await context.addInitScript(
    ({ defaults, themeId }) => {
      for (const [key, value] of Object.entries(defaults))
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      localStorage.setItem('splotch-theme', themeId);
    },
    { defaults: STORAGE, themeId: theme }
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  // A page with no origin yet has no localStorage; every surface's prepare starts by seeding it.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  for (const s of surfaces) {
    try {
      await s.prepare(page, { width, height });
      await page.waitForTimeout(400);
      await collect(page, s.id, theme, records);
      await s.cleanup?.(page);
    } catch (error) {
      failures.push(`${s.id}/${theme}: ${String(error.message).split('\n')[0]}`);
    }
    await page.evaluate(() => localStorage.clear()).catch(() => {});
  }
  await context.close();
}
await browser.close();

const sheets = [];
for (const concept of Object.keys(CONCEPTS))
  for (const theme of ['light', 'dark']) {
    const path = await composeSheet(
      concept,
      theme,
      records.filter((r) => r.concept === concept && r.theme === theme),
      out
    );
    if (path) sheets.push(path);
  }

const report = records.map(({ png, ...rest }) => rest);
writeFileSync(join(out, `computed-styles-${args.viewport}.json`), JSON.stringify(report, null, 2));

// Cluster: for each concept+theme, the distinct computed treatments and who has each.
const summary = [];
for (const concept of Object.keys(CONCEPTS))
  for (const theme of ['light', 'dark']) {
    const groups = new Map();
    for (const r of report.filter((r) => r.concept === concept && r.theme === theme)) {
      const key = STYLE_PROPS.concat('svg-fill')
        .map((p) => `${p}=${r.style[p]}`)
        .join('; ');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(`${r.surface}${r.label ? ` (${r.label})` : ''}`);
    }
    summary.push(`## ${concept} · ${theme} · ${args.viewport}: ${groups.size} distinct treatments`);
    for (const [key, who] of groups) summary.push(`- ${who.join(', ')}\n  - ${key}`);
    summary.push('');
  }
writeFileSync(join(out, `summary-${args.viewport}.md`), summary.join('\n'));
console.log(`sheets: ${sheets.join(', ')}`);
console.log(`records: ${records.length}; failures: ${failures.length}`);
for (const f of failures) console.log(`  ! ${f}`);
