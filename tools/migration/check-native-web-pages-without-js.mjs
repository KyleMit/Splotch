// Loads every page document the web export wrote with JavaScript disabled, at each layout and
// colour scheme its variants cover, and fails unless the page reads in full: the one variant that
// fits is the one shown, its heading and body text are the page's own, every link it must offer is
// a link, and every link that would ask for the grown-up check names its address as plain text
// instead of linking it (prerender-native-web-pages.mjs, RsdPageAnchor.tsx).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { NATIVE_WEB_EXPORT_DIR, NOT_FOUND_FILE } from './build-native-web.mjs';
import { FIRST_FRAME_THEMES } from './prerender-native-web.mjs';
import {
  DOCUMENT_ENTRIES,
  PAGE_VARIANT_ATTRIBUTE,
  PAGE_VARIANT_VIEWPORTS,
  VARIANT_FRAGMENT_SEPARATOR,
  documentEntry,
  documentPages,
} from './prerender-native-web-pages.mjs';
import releases from '../../web/src/lib/releases.json' with { type: 'json' };
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../../web/src/lib/components/beta/androidBeta.ts';
import {
  TESTFLIGHT_APP_URL,
  TESTFLIGHT_INVITE_URL,
} from '../../web/src/lib/components/beta/iosBeta.ts';
import { BETA_COPY } from '../../experiments/native-architecture/src/pageDocument/betaCopy.ts';
import {
  DESIGN_COPY,
  DESIGN_PARTS,
  DESIGN_SECTIONS,
} from '../../experiments/native-architecture/src/pageDocument/design/designSections.ts';
import { FEEDBACK_PAGE_COPY } from '../../experiments/native-architecture/src/information/feedbackPageCopy.ts';
import { REPORT_FORM_COPY } from '../../experiments/native-architecture/src/feedback/reportFormCopy.ts';
import { REPORT_KINDS } from '../../experiments/native-architecture/src/feedback/report.ts';

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
  // Every release reads, the older ones a script would fold away included, and the contents link
  // to the oldest lands on it.
  changelog() {
    return {
      heading: 'Changelog',
      text: [
        ...releases.map(({ version }) => `Version ${version}`),
        `That's every release since ${releases.at(-1).dateLabel}.`,
      ],
      outsideLinks: [],
      linked: ['/', '/privacy'],
      followsSectionLinks: releases.at(-1).id,
    };
  },
  // The form cannot send without a script, so the page says so in its place.
  feedback() {
    return {
      heading: FEEDBACK_PAGE_COPY.title,
      text: [
        FEEDBACK_PAGE_COPY.lede,
        FEEDBACK_PAGE_COPY.needsScript,
        FEEDBACK_PAGE_COPY.next,
        ...FEEDBACK_PAGE_COPY.steps,
      ],
      hiddenText: [
        ...REPORT_KINDS.map(({ label }) => label),
        REPORT_FORM_COPY.privacy,
        REPORT_FORM_COPY.send,
      ],
      outsideLinks: [],
      followsSectionLinks: false,
    };
  },
  // Both platforms' steps read, stacked, under links that jump to either one.
  beta() {
    return {
      heading: BETA_COPY.title,
      text: [BETA_COPY.lede, BETA_COPY.android, BETA_COPY.ios, BETA_COPY.troubleshooting],
      outsideLinks: [],
      linked: [
        TESTERS_GROUP_URL,
        BETA_OPT_IN_URL,
        PLAY_STORE_LISTING_URL,
        TESTFLIGHT_APP_URL,
        TESTFLIGHT_INVITE_URL,
        '/feedback',
        '/',
      ],
      followsSectionLinks: 'beta-ios',
    };
  },
  design() {
    return {
      heading: DESIGN_COPY.title,
      text: [
        DESIGN_COPY.lede,
        ...Object.values(DESIGN_PARTS).map(({ label }) => label),
        ...DESIGN_SECTIONS.map(({ label }) => label),
      ],
      outsideLinks: [],
      followsSectionLinks: true,
    };
  },
  // NOT_FOUND_COPY in RsdNotFoundPage.tsx, which a Node script cannot import.
  notFound() {
    return {
      heading: 'This page wandered off',
      text: ['The link may be old. These are still here:'],
      outsideLinks: [],
      linked: ['/', '/changelog', '/privacy'],
      followsSectionLinks: false,
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
export function serveExport(exportDir) {
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

// Follows the shown variant's in-page link to `target` (a fragment id), or its last section link,
// and reports where its target landed.
async function followSectionLink(tab, variantAttribute, key, target) {
  const links = tab
    .locator(`[${variantAttribute}="${key}"] a[href^="#"]`)
    .filter({ visible: true });
  const named = [];
  for (const link of await links.all())
    if ((await link.innerText()).trim().length > 1) named.push(link);
  const aimed = [];
  if (typeof target === 'string')
    for (const link of named)
      if ((await link.getAttribute('href'))?.split(VARIANT_FRAGMENT_SEPARATOR)[0] === `#${target}`)
        aimed.push(link);
  const link = typeof target === 'string' ? aimed.at(-1) : named.at(-1);
  if (!link) return null;
  const href = await link.getAttribute('href');
  await link.click();
  return tab.evaluate((followed) => {
    const target = document.getElementById(location.hash.slice(1));
    const anchor = [...document.querySelectorAll('a')].find(
      (candidate) => candidate.getAttribute('href') === followed && candidate.checkVisibility()
    );
    return {
      href: followed,
      found: target !== null,
      holdsLink: Boolean(target && anchor && target.contains(anchor)),
      visible: target?.checkVisibility() ?? false,
      top: target?.getBoundingClientRect().top ?? null,
      viewportHeight: innerHeight,
    };
  }, href);
}

export function sectionLinkProblems(at, followed) {
  if (!followed) return [`${at} has no in-page section link to follow`];
  const { href, found, visible, top, viewportHeight, holdsLink } = followed;
  // A target that holds the link, such as the page's own scroller, sits in view wherever the page
  // is scrolled, and following a link to it never scrolls its content.
  if (holdsLink)
    return [`${at} follows ${href} to an element that holds the link, which no fragment scrolls`];
  if (!found || !visible || top <= -SUBPIXEL_PX || top >= viewportHeight)
    return [
      `${at} follows ${href} to ${found ? (visible ? `a target at ${Math.round(top)} px` : 'a hidden target') : 'no target'}, not into view`,
    ];
  return [];
}

// A visible link's resolved address against an expected one: absolute, or a path on the page's own
// origin.
function sameAddress(link, href) {
  if (!href.startsWith('/')) return link === href;
  const { pathname, search, hash } = new URL(link);
  return pathname + search + hash === href;
}

export function pageWithoutJsProblems(file, key, expected, read) {
  const problems = [];
  const at = `${file} (${key}, JavaScript off)`;
  if (read.shown.length !== 1 || read.shown[0] !== key)
    return [`${at} shows variants [${read.shown.join(', ')}] instead of ${key}`];
  if (read.heading !== expected.heading)
    problems.push(`${at} is headed "${read.heading}", not "${expected.heading}"`);
  // innerText carries a heading's text-transform, so an uppercase rule label still reads its copy.
  const reads = read.text.toLowerCase();
  const missing = expected.text.filter(
    (text) => !reads.includes(text.replace(/\s+/g, ' ').toLowerCase())
  );
  if (missing.length) problems.push(`${at} does not read: ${missing.join(' | ')}`);
  const shown = (expected.hiddenText ?? []).filter((text) => read.text.includes(text));
  if (shown.length)
    problems.push(`${at} shows what cannot work without JavaScript: ${shown.join(' | ')}`);
  const linked = expected.outsideLinks.filter((href) => read.links.includes(href));
  if (linked.length) problems.push(`${at} links outside the grown-up check: ${linked.join(', ')}`);
  const unnamed = expected.outsideLinks.filter(
    (href) => !read.text.includes(new URL(href).hostname.replace(/^www\./, ''))
  );
  if (unnamed.length) problems.push(`${at} does not name the address of: ${unnamed.join(', ')}`);
  const unlinked = (expected.linked ?? []).filter(
    (href) => !read.links.some((link) => sameAddress(link, href))
  );
  if (unlinked.length) problems.push(`${at} does not link: ${unlinked.join(', ')}`);
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
      const { layouts } = DOCUMENT_ENTRIES[documentEntry(page)];
      for (const viewport of Object.values(PAGE_VARIANT_VIEWPORTS))
        for (const colorScheme of FIRST_FRAME_THEMES) {
          const context = await browser.newContext({
            javaScriptEnabled: false,
            viewport: { width: viewport.width, height: viewport.height },
            colorScheme,
          });
          const tab = await context.newPage();
          await tab.goto(`${origin}${path}`);
          await tab.evaluate(() => document.fonts.ready);
          const key = `${layouts.classOf(viewport)}-${colorScheme}`;
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
                await followSectionLink(
                  tab,
                  PAGE_VARIANT_ATTRIBUTE,
                  key,
                  expected.followsSectionLinks
                )
              )
            );
          await context.close();
        }
      if (problems.length === 0)
        log(
          `[native-web-pages] ${file} reads in full without JavaScript in all ${Object.keys(PAGE_VARIANT_VIEWPORTS).length * FIRST_FRAME_THEMES.length} layouts and colour schemes: ${expected.linked?.length ?? 0} links linked, ${expected.outsideLinks.length} outside links named, not linked${expected.followsSectionLinks ? ', and its section links followed into view' : ''}${expected.hiddenText ? `, and ${expected.hiddenText.length} script-only texts hidden` : ''}`
        );
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (problems.length) throw new Error(problems.join('\n'));
}

if (isMain(import.meta.url)) runMain(async () => checkPageDocumentsWithoutJavaScript());
