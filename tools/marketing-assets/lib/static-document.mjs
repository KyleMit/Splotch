// A self-contained HTML document rendered in Chromium for a marketing image. The page and every file
// it names are answered from memory and a closed map of repo files, so no server runs, no port is
// held, and no checkout but this one can supply a byte; any other request is aborted.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { createRequire } from 'node:module';
import { QUICKSAND_FONT_FAMILY } from '../../../web/src/lib/fonts.ts';

// A reserved name (RFC 2606) no network can answer: only the routes below reply.
const STATIC_DOCUMENT_ORIGIN = 'http://render.invalid';
export const QUICKSAND_STYLESHEET = '/fonts/quicksand/index.css';

const CONTENT_TYPES = {
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const quicksandDirectory = dirname(
  createRequire(import.meta.url).resolve('@fontsource-variable/quicksand/index.css')
);

// The app's own Quicksand: the @fontsource stylesheet the SvelteKit layout and the RN documents
// import, with its font files at the paths the stylesheet names relative to itself.
export function quicksandFiles() {
  const files = { [QUICKSAND_STYLESHEET]: join(quicksandDirectory, 'index.css') };
  for (const file of readdirSync(join(quicksandDirectory, 'files')))
    if (file.endsWith('.woff2'))
      files[`${dirname(QUICKSAND_STYLESHEET)}/files/${file}`] = join(
        quicksandDirectory,
        'files',
        file
      );
  return files;
}

// The global reset every app document applies (web/src/app.css), which the compositions were
// authored under.
export const DOCUMENT_RESET_CSS = '*{margin:0;padding:0;box-sizing:border-box}';

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Opens `html` at the static origin in a fresh context of `viewport`, answering each path in
// `files` (published path → repo file) and nothing else. The caller closes the returned context.
export async function openStaticDocument(browser, { html, files, viewport, colorScheme }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme });
  await context.route('**/*', (route) => route.abort());
  await context.route(`${STATIC_DOCUMENT_ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/')
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    const file = Object.hasOwn(files, pathname) ? files[pathname] : null;
    if (!file)
      return route.fulfill({ status: 404, body: `Not in the document's files: ${pathname}` });
    return route.fulfill({
      contentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  const page = await context.newPage();
  const failed = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  page.on('response', (response) => {
    if (!response.ok()) failed.push(response.url());
  });
  await page.goto(`${STATIC_DOCUMENT_ORIGIN}/`);
  return { context, page, failed };
}

// Resolves once every Quicksand weight the document sets has loaded and every image has decoded,
// and throws naming any file the document asked for and did not get.
export async function settleStaticDocument({ page, failed }, weights) {
  const loaded = await page.evaluate(
    async ({ family, weights: wanted }) => {
      const faces = await Promise.all(
        wanted.map((weight) => document.fonts.load(`${weight} 1em "${family}"`))
      );
      await document.fonts.ready;
      const images = [...document.images];
      await Promise.all(images.map((image) => image.decode().catch(() => {})));
      const textures = [...document.querySelectorAll('[style*="background-image"]')].map(
        (element) => /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(element).backgroundImage)?.[1]
      );
      await Promise.all(
        textures.map((source) => {
          const texture = new Image();
          texture.src = source ?? '';
          return texture.decode().catch(() => {});
        })
      );
      return {
        fonts: faces.every((face) => face.length > 0),
        broken: images.filter((image) => !image.naturalWidth).map((image) => image.src),
      };
    },
    { family: QUICKSAND_FONT_FAMILY, weights }
  );
  const missing = [...new Set([...failed, ...loaded.broken])];
  if (missing.length) throw new Error(`The document did not load: ${missing.join(', ')}`);
  if (!loaded.fonts) throw new Error(`${QUICKSAND_FONT_FAMILY} did not load`);
}
