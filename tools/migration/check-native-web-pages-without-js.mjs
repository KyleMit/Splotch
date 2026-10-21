// Loads every page document the web export wrote with JavaScript disabled, at each layout and
// colour scheme its variants cover, and fails unless the page reads in full: the one variant that
// fits is the one shown, its heading and body text are the page's own, and every link that would
// ask for the grown-up check names its address as plain text instead of linking it
// (prerender-native-web-pages.mjs, RsdPageAnchor.tsx).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { NATIVE_WEB_EXPORT_DIR, NOT_FOUND_FILE } from './build-native-web.mjs';
import { FIRST_FRAME_THEMES } from './prerender-native-web.mjs';
import {
  PAGE_VARIANT_ATTRIBUTE,
  PAGE_VARIANT_VIEWPORTS,
  documentPages,
} from './prerender-native-web-pages.mjs';

const PRIVACY_POLICY = join(
  ROOT,
  'experiments/native-architecture/src/information/privacy.generated.json'
);
const OUTSIDE_LINK = /^https?:\/\//;
// A followed target scrolled to the top of its scroller can sit a fraction of a pixel above it.
const SUBPIXEL_PX = 1;

// What each page document must read without JavaScript, from the content its page renders.
export const PAGE_TEXT_WITHOUT_JS = {
  privacy() {
    const { title, lede, sections } = JSON.parse(readFileSync(PRIVACY_POLICY, 'utf8')).web;
    const hrefs = sections.flatMap(({ blocks }) =>
      blocks.flatMap(({ spans }) => spans.map(({ href }) => href).filter((href) => href))
    );
    return {
      heading: title,
      text: [lede, ...sections.map((section) => section.title)],
      outsideLinks: [...new Set(hrefs.filter((href) => OUTSIDE_LINK.test(href)))],
      followsSectionLinks: true,
    };
  },
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// A static host as Netlify answers the export: a file, else its pretty URL, else the 404 page.
function serveExport(exportDir) {
  const base = resolve(exportDir);
  const fileAt = (pathname) => {
    const candidate = resolve(base, `.${decodeURIComponent(pathname)}`);
    if (!candidate.startsWith(base + sep)) return null;
    return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
  };
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const file = fileAt(pathname) ?? fileAt(`${pathname}.html`);
    response.statusCode = file ? 200 : 404;
    const served = file ?? join(base, NOT_FOUND_FILE);
    response.setHeader(
      'Content-Type',
      CONTENT_TYPES[extname(served)] ?? 'application/octet-stream'
    );
    response.end(readFileSync(served));
  });
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(server)));
}

// Reads what a visitor sees: the variants shown, the visible heading and text, and the visible
// links' addresses.
function readPage(variantAttribute) {
  const shown = (element) => element.checkVisibility();
  const variants = [...document.querySelectorAll(`[${variantAttribute}]`)].filter(shown);
  const root = variants[0];
  return {
    shown: variants.map((variant) => variant.getAttribute(variantAttribute)),
    heading: root?.querySelector('h1')?.textContent ?? null,
    text: root?.innerText.replace(/\s+/g, ' ') ?? '',
    links: root ? [...root.querySelectorAll('a[href]')].filter(shown).map((a) => a.href) : [],
  };
}

// Follows the shown variant's last in-page section link and reports where its target landed.
async function followSectionLink(tab, variantAttribute, key) {
  const links = tab
    .locator(`[${variantAttribute}="${key}"] a[href^="#"]`)
    .filter({ visible: true });
  const named = [];
  for (const link of await links.all())
    if ((await link.innerText()).trim().length > 1) named.push(link);
  const link = named.at(-1);
  if (!link) return null;
  const href = await link.getAttribute('href');
  await link.click();
  return tab.evaluate((followed) => {
    const target = document.getElementById(location.hash.slice(1));
    return {
      href: followed,
      found: target !== null,
      visible: target?.checkVisibility() ?? false,
      top: target?.getBoundingClientRect().top ?? null,
      viewportHeight: innerHeight,
    };
  }, href);
}

export function sectionLinkProblems(at, followed) {
  if (!followed) return [`${at} has no in-page section link to follow`];
  const { href, found, visible, top, viewportHeight } = followed;
  if (!found || !visible || top <= -SUBPIXEL_PX || top >= viewportHeight)
    return [
      `${at} follows ${href} to ${found ? (visible ? `a target at ${Math.round(top)} px` : 'a hidden target') : 'no target'}, not into view`,
    ];
  return [];
}

export function pageWithoutJsProblems(file, key, expected, read) {
  const problems = [];
  const at = `${file} (${key}, JavaScript off)`;
  if (read.shown.length !== 1 || read.shown[0] !== key)
    return [`${at} shows variants [${read.shown.join(', ')}] instead of ${key}`];
  if (read.heading !== expected.heading)
    problems.push(`${at} is headed "${read.heading}", not "${expected.heading}"`);
  const missing = expected.text.filter((text) => !read.text.includes(text.replace(/\s+/g, ' ')));
  if (missing.length) problems.push(`${at} does not read: ${missing.join(' | ')}`);
  const linked = expected.outsideLinks.filter((href) => read.links.includes(href));
  if (linked.length) problems.push(`${at} links outside the grown-up check: ${linked.join(', ')}`);
  const unnamed = expected.outsideLinks.filter(
    (href) => !read.text.includes(new URL(href).hostname.replace(/^www\./, ''))
  );
  if (unnamed.length) problems.push(`${at} does not name the address of: ${unnamed.join(', ')}`);
  return problems;
}

export async function checkPageDocumentsWithoutJavaScript({
  exportDir = NATIVE_WEB_EXPORT_DIR,
  pages = documentPages(),
  log = console.log,
} = {}) {
  const unexpected = pages.filter(({ page }) => !PAGE_TEXT_WITHOUT_JS[page]);
  if (unexpected.length)
    throw new Error(
      `PAGE_TEXT_WITHOUT_JS names no text for: ${unexpected.map(({ page }) => page).join(', ')}`
    );
  const server = await serveExport(exportDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const problems = [];
  try {
    for (const { page, path, file } of pages) {
      const expected = PAGE_TEXT_WITHOUT_JS[page]();
      for (const [layout, { width, height }] of Object.entries(PAGE_VARIANT_VIEWPORTS))
        for (const colorScheme of FIRST_FRAME_THEMES) {
          const context = await browser.newContext({
            javaScriptEnabled: false,
            viewport: { width, height },
            colorScheme,
          });
          const tab = await context.newPage();
          await tab.goto(`${origin}${path}`);
          await tab.evaluate(() => document.fonts.ready);
          const key = `${layout}-${colorScheme}`;
          problems.push(
            ...pageWithoutJsProblems(
              file,
              key,
              expected,
              await tab.evaluate(readPage, PAGE_VARIANT_ATTRIBUTE)
            )
          );
          if (expected.followsSectionLinks)
            problems.push(
              ...sectionLinkProblems(
                `${file} (${key}, JavaScript off)`,
                await followSectionLink(tab, PAGE_VARIANT_ATTRIBUTE, key)
              )
            );
          await context.close();
        }
      if (problems.length === 0)
        log(
          `[native-web-pages] ${file} reads in full without JavaScript in all ${Object.keys(PAGE_VARIANT_VIEWPORTS).length * FIRST_FRAME_THEMES.length} layouts and colour schemes, ${expected.outsideLinks.length} outside links named, not linked, and its section links followed into view`
        );
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length) throw new Error(problems.join('\n'));
}

if (isMain(import.meta.url)) runMain(async () => checkPageDocumentsWithoutJavaScript());
