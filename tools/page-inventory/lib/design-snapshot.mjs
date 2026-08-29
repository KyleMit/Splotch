import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

// Snapshots are built here first so they exist on disk while a long capture is
// still running, then copied into the inventory's atomic output.
export const DESIGN_SNAPSHOT_OUT = join(ROOT, '.scrapbook-scratch/design-snapshots');
// Where they come to rest, committed beside the captures they were taken from.
export const DESIGN_BUNDLE_DIRECTORY = 'design';
export const DESIGN_BUNDLE_OUT = join(ROOT, 'scrapbook/page-inventory', DESIGN_BUNDLE_DIRECTORY);

// Svelte only attaches __svelte_meta under `dev`, which is the whole reason the
// inventory captures against the dev server. Every element that carries one is
// stamped with the file and line that produced it, so an edited snapshot names
// its own source and design changes port back without matching CSS by eye.
const SOURCE_ATTRIBUTE = 'data-src';
const CANVAS_ATTRIBUTE = 'data-snapshot-canvas';
const MODAL_ATTRIBUTE = 'data-snapshot-modal';
const SHARED_STYLESHEET = 'surfaces.css';
const BASELINE_STYLESHEET = 'surfaces.baseline.css';
const STYLESHEET_ASSET_PREFIX = '';
const ASSET_DIRECTORY = 'assets';
const ASSET_HASH_LENGTH = 16;
// The element is already known to be on screen, so this only has to outlast a
// compositor frame rather than Playwright's default visibility wait.
const CANVAS_SCREENSHOT_MS = 5_000;

// A snapshot is a still. Anything that would run, refetch, or re-render on open
// is dropped rather than carried over dead.
const DISCARDED_SELECTORS = [
  'script',
  'link[rel="modulepreload"]',
  'link[rel="preload"]',
  'link[rel="stylesheet"]',
  'link[rel="manifest"]',
  'noscript',
];

const URL_IN_CSS = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function extractInPage({ sourceAttribute, canvasAttribute, modalAttribute, discarded }) {
  const rootUrl = document.baseURI;
  const isInlinable = (value) =>
    Boolean(value) && !value.startsWith('data:') && !value.startsWith('blob:');

  for (const element of document.querySelectorAll('*')) {
    const loc = element.__svelte_meta?.loc;
    if (loc?.file) element.setAttribute(sourceAttribute, `${loc.file}:${loc.line}`);
  }

  // A canvas holds pixels, not markup, so serializing the DOM loses whatever is
  // drawn on it. Painting those pixels back as a background keeps the element,
  // its classes, and every rule that targets it exactly as they were.
  const canvases = [];
  document.querySelectorAll('canvas').forEach((canvas, index) => {
    const id = `c${index}`;
    canvas.setAttribute(canvasAttribute, id);
    const box = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    // Recorded here because only the page can answer it, and the screenshot
    // fallback in Node would otherwise wait out its visibility timeout on every
    // offscreen tile.
    const visible =
      box.width >= 1 &&
      box.height >= 1 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      box.bottom > 0 &&
      box.top < innerHeight &&
      box.right > 0 &&
      box.left < innerWidth;
    try {
      canvases.push({ id, visible, dataUrl: canvas.toDataURL('image/png') });
    } catch {
      // A tainted canvas cannot be read; the element still serializes blank.
    }
  });

  // ::backdrop — the dim and blur behind every modal — renders only for an
  // element in the top layer. Reopening the dialog to get back there restarts
  // its entry animation, which the capture froze at frame zero, so the backdrop
  // is rebuilt instead: a fixed sibling carrying the computed ::backdrop paint,
  // stacked directly beneath the dialog.
  const backdrops = [];
  for (const dialog of document.querySelectorAll('dialog')) {
    if (!dialog.matches(':modal')) continue;
    const id = `b${backdrops.length}`;
    const backdrop = getComputedStyle(dialog, '::backdrop');
    dialog.setAttribute(modalAttribute, id);
    const element = document.createElement('div');
    element.setAttribute(`${modalAttribute}-layer`, id);
    dialog.parentElement?.insertBefore(element, dialog);
    backdrops.push({
      id,
      background: backdrop.backgroundColor,
      backgroundImage: backdrop.backgroundImage,
    });
  }

  const css = [...document.querySelectorAll('style')]
    .map((style) => style.textContent ?? '')
    .filter(Boolean);

  const references = new Set();
  const record = (value) => {
    if (!isInlinable(value)) return;
    try {
      const resolved = new URL(value, rootUrl);
      // A bare origin is a page, not an asset, and its "/" pathname would match
      // every separator in the document once rewriting starts.
      if (resolved.pathname.length > 1) references.add(resolved.href);
    } catch {
      // Not a resolvable reference; leave the attribute untouched.
    }
  };

  for (const element of document.querySelectorAll('[src], [srcset], [style]')) {
    record(element.getAttribute('src'));
    for (const candidate of (element.getAttribute('srcset') ?? '').split(',')) {
      record(candidate.trim().split(/\s+/)[0]);
    }
    for (const match of (element.getAttribute('style') ?? '').matchAll(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
    )) {
      record(match[2]);
    }
  }
  for (const block of css) {
    for (const match of block.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) record(match[2]);
  }

  for (const element of document.querySelectorAll(discarded.join(','))) element.remove();

  const html = document.documentElement;
  return {
    css,
    canvases,
    backdrops,
    references: [...references],
    rootAttributes: Object.fromEntries(
      [...html.attributes].map((attribute) => [attribute.name, attribute.value])
    ),
    headHtml: document.head.innerHTML,
    bodyHtml: document.body.innerHTML,
    bodyAttributes: Object.fromEntries(
      [...document.body.attributes].map((attribute) => [attribute.name, attribute.value])
    ),
    lang: html.getAttribute('lang') ?? 'en',
  };
}

export function extensionFor(url, contentType) {
  const fromPath = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (fromPath) return fromPath.toLowerCase();
  const subtype = contentType?.split(';')[0]?.split('/')[1];
  if (!subtype) return 'bin';
  return subtype === 'svg+xml' ? 'svg' : subtype.replace(/[^a-z0-9]/g, '');
}

// Assets are content-addressed so the whole inventory shares one copy of each
// icon and font, whatever surface first pulled it in.
export function assetFileName(bytes, extension) {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, ASSET_HASH_LENGTH);
  return `${ASSET_DIRECTORY}/${digest}.${extension}`;
}

export async function downloadReferences(references, cache, fetchImpl = fetch) {
  const downloaded = new Map();
  for (const reference of references) {
    if (cache.has(reference)) {
      downloaded.set(reference, cache.get(reference));
      continue;
    }
    try {
      const response = await fetchImpl(reference);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const asset = {
        fileName: assetFileName(
          bytes,
          extensionFor(reference, response.headers.get('content-type'))
        ),
        bytes,
      };
      cache.set(reference, asset);
      downloaded.set(reference, asset);
    } catch {
      // An asset the dev server will not serve is left as its original URL.
    }
  }
  return downloaded;
}

// Snapshots sit one directory below the shared stylesheet and asset store, so
// every rewritten reference has to climb back out.
export function rewriteReferences(text, assets, prefix) {
  // Longest first: a shorter path that prefixes a longer one would otherwise
  // consume it and leave the tail dangling.
  const substitutions = [...assets]
    .flatMap(([reference, asset]) => {
      const { pathname, search } = new URL(reference);
      const replacement = `${prefix}${asset.fileName}`;
      return [
        [reference, replacement],
        [`${pathname}${search}`, replacement],
      ];
    })
    .sort(([a], [b]) => b.length - a.length);

  let rewritten = text;
  for (const [needle, replacement] of substitutions) {
    rewritten = rewritten.split(needle).join(replacement);
  }
  return rewritten;
}

export function collectStyleBlocks(blocks, shared) {
  for (const block of blocks) if (!shared.includes(block)) shared.push(block);
  return shared;
}

const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function renderAttributes(attributes) {
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
}

// The Design System pane builds its card index from this first-line marker, so
// it has to be the very first bytes of the file.
export function designCardMarker(group) {
  return `<!-- @dsCard group="${escapeAttribute(group)}" -->`;
}

// The top layer put both of these above every stacking context on the page, so
// reproducing it needs explicit z-indexes: document order alone leaves an
// auto-stacked backdrop behind every positioned element that follows it. The
// dialog's rule is !important because the app styles it by class and would
// otherwise out-specify an attribute selector and end up under its own backdrop.
const MODAL_LAYER_Z = 2147483646;

export function modalBackdropCss(backdrops) {
  return backdrops
    .flatMap(({ id, background, backgroundImage }) => {
      const declarations = [
        'position:fixed',
        'inset:0',
        `background-color:${background}`,
        `z-index:${MODAL_LAYER_Z}`,
      ];
      if (backgroundImage && backgroundImage !== 'none') {
        declarations.push(`background-image:${backgroundImage}`);
      }
      // The captured ::backdrop filter is deliberately dropped. Chromium folds
      // the dialog into the filtered layer even when it paints above on a
      // higher z-index and on its own compositing layer, so carrying the blur
      // over blurs the modal itself — a far larger deviation than losing the
      // blur behind it. The dim is reproduced; a blurred backdrop is not.
      return [
        `      [${MODAL_ATTRIBUTE}-layer="${id}"]{${declarations.join(';')}}`,
        `      [${MODAL_ATTRIBUTE}="${id}"]{z-index:${MODAL_LAYER_Z + 1}!important}`,
      ];
    })
    .join('\n');
}

export function renderSnapshotDocument({
  cardGroup,
  title,
  sourceComment,
  rootAttributes,
  bodyAttributes,
  bodyHtml,
  canvasCss,
  stylesheetHref,
}) {
  const canvasStyle = canvasCss ? `\n    <style>\n${canvasCss}\n    </style>` : '';
  return `${designCardMarker(cardGroup)}
<!doctype html>
<html${renderAttributes(rootAttributes)}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeAttribute(title)}</title>
    ${sourceComment}
    <link rel="stylesheet" href="${stylesheetHref}" />${canvasStyle}
  </head>
  <body${renderAttributes(bodyAttributes)}>
${bodyHtml}
  </body>
</html>
`;
}

export function canvasBackgroundCss(canvasAssets) {
  return canvasAssets
    .map(
      ({ id, href }) =>
        `      [${CANVAS_ATTRIBUTE}="${id}"]{background-image:url("${href}");background-size:100% 100%;background-repeat:no-repeat}`
    )
    .join('\n');
}

export async function isFullyTransparent(bytes) {
  try {
    const { channels, isOpaque } = await sharp(bytes).stats();
    if (isOpaque) return false;
    const alpha = channels.at(-1);
    return alpha !== undefined && alpha.max === 0;
  } catch {
    return false;
  }
}

// The paper surface is a stack of tiles whose pixels are composited elsewhere,
// so reading them back off their own context yields nothing. Compositing is
// exactly what an element screenshot sees, so a blank readback falls through to
// one rather than dropping the texture the capture shows.
async function canvasPixels(page, { id, visible }, readback) {
  if (!visible || !(await isFullyTransparent(readback))) return readback;
  const composited = await page
    .locator(`[${CANVAS_ATTRIBUTE}="${id}"]`)
    .screenshot({ type: 'png', timeout: CANVAS_SCREENSHOT_MS })
    .catch(() => undefined);
  return composited ?? readback;
}

/**
 * Serialize the page as it stands into a standalone snapshot, reusing `cache`
 * and `sharedStyles` across a run so every surface shares one asset store and
 * one stylesheet.
 */
export async function captureDesignSnapshot(page, context) {
  const { item, viewport, theme, out, snapshotPath, cache, sharedStyles, fetchImpl } = context;
  const extracted = await page.evaluate(extractInPage, {
    sourceAttribute: SOURCE_ATTRIBUTE,
    canvasAttribute: CANVAS_ATTRIBUTE,
    modalAttribute: MODAL_ATTRIBUTE,
    discarded: DISCARDED_SELECTORS,
  });

  const depth = snapshotPath.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  const assets = await downloadReferences(extracted.references, cache, fetchImpl);
  for (const [, asset] of assets) {
    const target = join(out, asset.fileName);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, asset.bytes);
  }

  const canvasAssets = [];
  for (const canvas of extracted.canvases) {
    const { id, dataUrl } = canvas;
    const bytes = await canvasPixels(page, canvas, Buffer.from(dataUrl.split(',')[1], 'base64'));
    if (!bytes) continue;
    const fileName = assetFileName(bytes, 'png');
    const target = join(out, fileName);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    canvasAssets.push({ id, href: `${prefix}${fileName}` });
  }

  // The shared stylesheet sits at the bundle root while snapshots sit one level
  // below it, and a CSS url() resolves against the stylesheet rather than the
  // document that linked it — so the two need different prefixes.
  collectStyleBlocks(
    extracted.css.map((block) => rewriteReferences(block, assets, STYLESHEET_ASSET_PREFIX)),
    sharedStyles
  );

  const document = renderSnapshotDocument({
    cardGroup: item.group,
    title: `${item.title} · ${viewport.category} · ${theme.label}`,
    sourceComment: `<!-- ${item.group}/${item.id} at ${viewport.width}×${viewport.height} (${viewport.device}, ${viewport.orientation}), ${theme.label}. Generated by npm run capture:page-inventory — edit to redesign, then run npm run design:port-back. -->`,
    rootAttributes: extracted.rootAttributes,
    bodyAttributes: extracted.bodyAttributes,
    bodyHtml: rewriteReferences(extracted.bodyHtml, assets, prefix),
    canvasCss: [canvasBackgroundCss(canvasAssets), modalBackdropCss(extracted.backdrops)]
      .filter(Boolean)
      .join('\n'),
    stylesheetHref: `${prefix}${SHARED_STYLESHEET}`,
  });

  const target = join(out, snapshotPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, document);
  return { path: snapshotPath, bytes: Buffer.byteLength(document) };
}

// DesignSync reads a file back at up to this size, and a snapshot Claude Design
// cannot read is a snapshot it cannot edit.
export const DESIGN_FILE_READ_LIMIT_BYTES = 256 * 1024;

// Dev serves every component's CSS unminified, which is ~70 KiB of pure
// whitespace across the app and would push the one file every snapshot links
// past the read limit. esbuild is already a Vite dependency.
export async function writeSharedStylesheet(out, sharedStyles) {
  const target = join(out, SHARED_STYLESHEET);
  mkdirSync(dirname(target), { recursive: true });
  const joined = `${sharedStyles.join('\n')}\n`;
  const { code } = await transform(joined, { loader: 'css', minify: true });
  writeFileSync(target, code);
  // Kept beside the editable copy so port-back has something to diff against
  // once a design session has rewritten the original in place.
  writeFileSync(join(out, BASELINE_STYLESHEET), code);
  return { path: SHARED_STYLESHEET, bytes: Buffer.byteLength(code) };
}

export function oversizedSnapshots(snapshots) {
  return snapshots.filter(({ bytes }) => bytes > DESIGN_FILE_READ_LIMIT_BYTES);
}

// Claude Design wants one representative card per surface per theme, not the
// whole eight-viewport review matrix: a phone in portrait and a tablet in
// landscape are the two shapes every layout decision here has to satisfy.
export const DESIGN_SNAPSHOT_VIEWPORT_IDS = ['iphone-16-pro-max', 'ipad-pro-13-m4-landscape'];

export function designSnapshotPath(item, viewport, theme) {
  return `surfaces/${item.group}--${item.id}--${viewport.id}--${theme.id}.html`;
}

export function renderDesignIndex(snapshots) {
  const rows = snapshots
    .map(
      ({ path, title, group }) =>
        `      <li><a href="${path}">${escapeAttribute(`${group} · ${title}`)}</a></li>`
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Splotch design snapshots</title>
  </head>
  <body>
    <h1>Splotch design snapshots</h1>
    <p>${snapshots.length} standalone captures of the running app. Every element carries a
      <code>${SOURCE_ATTRIBUTE}</code> attribute naming the Svelte file and line that rendered it.</p>
    <ul>
${rows}
    </ul>
  </body>
</html>
`;
}

export { BASELINE_STYLESHEET, CANVAS_ATTRIBUTE, SHARED_STYLESHEET, SOURCE_ATTRIBUTE, URL_IN_CSS };
