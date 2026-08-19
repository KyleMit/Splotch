import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'svelte/compiler';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const OUTPUT_DIR = join(ROOT, 'web/.svelte-kit/output');
const PRERENDERED_INDEX = join(OUTPUT_DIR, 'prerendered/pages/index.html');
const CLIENT_DIR = join(OUTPUT_DIR, 'client');
const NATIVE_DIR = join(ROOT, 'web/build');
const RUNTIME_GENERATED_STARTUP_URLS = new Set(['_app/env.js']);

// The reviewed 2026-08-19 startup baseline is 470,780 bytes; 54,220 bytes of headroom permits ordinary app growth while catching another large eager dependency.
export const MAX_STARTUP_JS_CSS_BYTES = 525_000;
// The reviewed 2026-08-19 largest-lazy-chunk baseline is 65,418 bytes; 9,582 bytes of headroom allows modest feature growth without hiding a major chunk merger.
export const MAX_LAZY_CHUNK_BYTES = 75_000;
// The reviewed 2026-08-19 stripped native-export baseline is 6,629,735 bytes; 370,265 bytes of headroom accommodates normal asset churn while rejecting another bundled coloring book.
export const MAX_NATIVE_EXPORT_BYTES = 7_000_000;

function staticAttribute(element, name) {
  const attribute = element.attributes.find(
    (candidate) => candidate.type === 'Attribute' && candidate.name === name
  );
  if (!attribute) return undefined;
  if (!Array.isArray(attribute.value) || attribute.value.some((part) => part.type !== 'Text')) {
    throw new Error(`Prerendered <link> ${name} must be a static attribute`);
  }
  return attribute.value.map((part) => part.data).join('');
}

export function startupResourceHrefsFromHtml(html) {
  const hrefs = [];
  const visited = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.type === 'RegularElement' && node.name === 'link') {
      const rel = staticAttribute(node, 'rel');
      const href = staticAttribute(node, 'href');
      if (
        href &&
        rel?.split(/\s+/).some((value) => ['modulepreload', 'stylesheet'].includes(value))
      ) {
        hrefs.push(href);
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(parse(html, { modern: true }).fragment);
  return hrefs;
}

function filesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

function clientPathFromHref(clientDir, href) {
  const base = new URL('https://bundle.invalid/');
  const url = new URL(href, base);
  if (url.origin !== base.origin) {
    throw new Error(`Startup resource is not local to the client bundle: ${href}`);
  }
  return join(clientDir, decodeURIComponent(url.pathname.slice(1)));
}

export function measureWebBundle({ prerenderedIndex, clientDir }) {
  if (!existsSync(prerenderedIndex)) {
    throw new Error(`Prerendered home page does not exist: ${prerenderedIndex}`);
  }
  const hrefs = startupResourceHrefsFromHtml(readFileSync(prerenderedIndex, 'utf8'));
  if (!hrefs.length) {
    throw new Error(`No modulepreload or stylesheet links found in ${prerenderedIndex}`);
  }

  const startupPaths = new Set();
  let startupBytes = 0;
  for (const href of hrefs) {
    const path = clientPathFromHref(clientDir, href);
    const clientRelativePath = relative(clientDir, path);
    if (!existsSync(path)) {
      if (RUNTIME_GENERATED_STARTUP_URLS.has(clientRelativePath)) continue;
      throw new Error(`Startup resource does not exist: ${path}`);
    }
    if (startupPaths.has(path)) continue;
    startupPaths.add(path);
    startupBytes += statSync(path).size;
  }
  if (!startupPaths.size) {
    throw new Error(`No startup resource links resolved inside ${clientDir}`);
  }

  const lazyChunks = filesRecursively(join(clientDir, '_app/immutable'))
    .filter((path) => path.endsWith('.js') && !startupPaths.has(path))
    .map((path) => ({ path: relative(clientDir, path), bytes: statSync(path).size }))
    .sort((left, right) => right.bytes - left.bytes);
  if (!lazyChunks.length) throw new Error(`No lazy JavaScript chunks found in ${clientDir}`);

  return { startupBytes, startupFileCount: startupPaths.size, largestLazyChunk: lazyChunks[0] };
}

export function measureNativeExport(dir) {
  if (!existsSync(dir)) throw new Error(`Native static export does not exist: ${dir}`);
  const files = filesRecursively(dir);
  if (!files.length) throw new Error(`Native static export contains no files: ${dir}`);
  return {
    bytes: files.reduce((total, path) => total + statSync(path).size, 0),
    fileCount: files.length,
  };
}

export function webBundleBudgetProblems({ startupBytes, largestLazyChunk }) {
  return [
    ...(startupBytes > MAX_STARTUP_JS_CSS_BYTES
      ? [
          `Startup JS/CSS is ${startupBytes} bytes, above the ${MAX_STARTUP_JS_CSS_BYTES}-byte budget`,
        ]
      : []),
    ...(largestLazyChunk.bytes > MAX_LAZY_CHUNK_BYTES
      ? [
          `Largest lazy JS chunk is ${largestLazyChunk.bytes} bytes, above the ${MAX_LAZY_CHUNK_BYTES}-byte budget (${largestLazyChunk.path})`,
        ]
      : []),
  ];
}

export function nativeExportBudgetProblems({ bytes }) {
  return bytes > MAX_NATIVE_EXPORT_BYTES
    ? [`Native static export is ${bytes} bytes, above the ${MAX_NATIVE_EXPORT_BYTES}-byte budget`]
    : [];
}

export async function checkBundleBudgets({ native }) {
  if (native) {
    const measurement = measureNativeExport(NATIVE_DIR);
    const problems = nativeExportBudgetProblems(measurement);
    if (problems.length) throw new Error(problems.join('\n'));
    console.log(
      `[bundle-budgets] native export ${measurement.bytes}/${MAX_NATIVE_EXPORT_BYTES} bytes across ${measurement.fileCount} files`
    );
    return;
  }

  const measurement = measureWebBundle({
    prerenderedIndex: PRERENDERED_INDEX,
    clientDir: CLIENT_DIR,
  });
  const problems = webBundleBudgetProblems(measurement);
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(
    `[bundle-budgets] startup JS/CSS ${measurement.startupBytes}/${MAX_STARTUP_JS_CSS_BYTES} bytes across ${measurement.startupFileCount} files; ` +
      `largest lazy JS ${measurement.largestLazyChunk.bytes}/${MAX_LAZY_CHUNK_BYTES} bytes (${measurement.largestLazyChunk.path})`
  );
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { native: { type: 'boolean' } } });
  runMain(() => checkBundleBudgets({ native: values.native }));
}
