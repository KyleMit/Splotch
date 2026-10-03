import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'svelte/compiler';
import { filesRecursively } from './lib/filesystem.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import { isInstrumentedBuild } from './lib/build-instrumentation.mjs';

const OUTPUT_DIR = join(ROOT, 'web/.svelte-kit/output');
const PRERENDERED_INDEX = join(OUTPUT_DIR, 'prerendered/pages/index.html');
const CLIENT_DIR = join(OUTPUT_DIR, 'client');
const NATIVE_DIR = join(ROOT, 'web/build');
// SvelteKit emits this module, and makes every prerendered boot script await it
// before importing any app code, only when a client chunk reads
// `$env/dynamic/public`. It has no file in the static output, so production
// serves it from the SSR function; web/src/lib/server/devHarness.ts keeps the
// one runtime public-env read server-side for that reason.
const RUNTIME_ENV_MODULE_URL = '_app/env.js';

// The reviewed 2026-09-11 startup baseline is 473,352 bytes, after ADR-0164 moved the deferred icons off the path; 51,648 bytes of headroom permits ordinary app growth while catching another large eager dependency. Consuming it is the cue to find the next lever before raising the number (ADR-0032's headroom amendment).
export const MAX_STARTUP_JS_CSS_BYTES = 525_000;
// Modulepreloads cost requests before hydration even below the byte budget. The exact pin requires deliberate growth and locks in measured drops (ADR-0032's modulepreload-count amendment).
export const STARTUP_MODULEPRELOAD_COUNT = 38;
// The reviewed 2026-09-28 native export boots its WebView from an index.html that modulepreloads 28 chunks. It has its own pin because a runtime import used only inside an `__IS_CAPACITOR__` branch can add a native startup chunk while the web count stays put (ADR-0032's native modulepreload-count amendment).
export const NATIVE_STARTUP_MODULEPRELOAD_COUNT = 28;
// The reviewed 2026-08-19 largest bundle-wide lazy chunk is the public /design route at 65,418 bytes; 9,582 bytes of headroom permits modest growth while catching a larger deployed lazy route.
export const MAX_LAZY_CHUNK_BYTES = 75_000;
// The reviewed 2026-08-19 stripped native-export baseline is 6,629,727 bytes; 370,273 bytes of headroom accommodates normal asset churn while rejecting another bundled coloring book.
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

export function startupResourcesFromHtml(html) {
  const parsed = parse(html, { modern: true });
  const hrefs = [];
  let modulepreloadCount = 0;
  let inlineStyleBytes = Buffer.byteLength(parsed.css?.content.styles ?? '');
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
      const relations = new Set(rel?.split(/\s+/));
      const disabled = node.attributes.some(
        (attribute) => attribute.type === 'Attribute' && attribute.name === 'disabled'
      );
      if (href && (relations.has('modulepreload') || (relations.has('stylesheet') && !disabled))) {
        hrefs.push(href);
      }
      if (href && relations.has('modulepreload')) modulepreloadCount += 1;
    }
    if (node.type === 'RegularElement' && node.name === 'style') {
      if (node.fragment.nodes.some((part) => part.type !== 'Text')) {
        throw new Error('Prerendered <style> must contain static CSS');
      }
      inlineStyleBytes += Buffer.byteLength(node.fragment.nodes.map((part) => part.data).join(''));
    }
    Object.values(node).forEach(visit);
  };
  visit(parsed.fragment);
  return { hrefs, modulepreloadCount, inlineStyleBytes };
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
  const html = readFileSync(prerenderedIndex, 'utf8');
  if (html.includes(RUNTIME_ENV_MODULE_URL)) {
    throw new Error(
      `${prerenderedIndex} waits on the function-served ${RUNTIME_ENV_MODULE_URL} before app code runs — a client module imports $env/dynamic/public; move that read server-side`
    );
  }
  const { hrefs, modulepreloadCount, inlineStyleBytes } = startupResourcesFromHtml(html);
  if (!hrefs.length) {
    throw new Error(`No modulepreload or active stylesheet links found in ${prerenderedIndex}`);
  }

  const startupPaths = new Set();
  let startupBytes = inlineStyleBytes;
  for (const href of hrefs) {
    const path = clientPathFromHref(clientDir, href);
    if (!existsSync(path)) throw new Error(`Startup resource does not exist: ${path}`);
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

  return {
    startupBytes,
    startupFileCount: startupPaths.size,
    modulepreloadCount,
    inlineStyleBytes,
    largestLazyChunk: lazyChunks[0],
  };
}

export function measureNativeExport(dir) {
  if (!existsSync(dir)) throw new Error(`Native static export does not exist: ${dir}`);
  const files = filesRecursively(dir);
  if (!files.length) throw new Error(`Native static export contains no files: ${dir}`);
  const index = join(dir, 'index.html');
  if (!existsSync(index)) throw new Error(`Native static export has no index.html: ${index}`);
  return {
    bytes: files.reduce((total, path) => total + statSync(path).size, 0),
    fileCount: files.length,
    modulepreloadCount: startupResourcesFromHtml(readFileSync(index, 'utf8')).modulepreloadCount,
  };
}

const WEB_MODULEPRELOAD_PIN = {
  page: 'The prerendered / page',
  count: STARTUP_MODULEPRELOAD_COUNT,
  name: 'STARTUP_MODULEPRELOAD_COUNT',
};
const NATIVE_MODULEPRELOAD_PIN = {
  page: "The native export's index.html",
  count: NATIVE_STARTUP_MODULEPRELOAD_COUNT,
  name: 'NATIVE_STARTUP_MODULEPRELOAD_COUNT',
};

function modulepreloadCountProblems(count, pin) {
  if (count === pin.count) return [];
  const found = `${pin.page} modulepreloads ${count} chunks`;
  return [
    count > pin.count
      ? `${found}, up from ${pin.count}: a new chunk now loads before hydration. The usual cause is a startup module importing a runtime export that lazy code also imports, which splits the shared module into a chunk of its own; give that export a module only the startup path imports. If the new startup chunk is intended, raise ${pin.name} in tools/check-bundle-budgets.mjs and say why in the PR`
      : `${found}, down from ${pin.count}: lower ${pin.name} in tools/check-bundle-budgets.mjs to lock the gain in`,
  ];
}

export function webBundleBudgetProblems({ startupBytes, modulepreloadCount, largestLazyChunk }) {
  return [
    ...(startupBytes > MAX_STARTUP_JS_CSS_BYTES
      ? [
          `Startup JS/CSS is ${startupBytes} bytes, above the ${MAX_STARTUP_JS_CSS_BYTES}-byte budget`,
        ]
      : []),
    ...modulepreloadCountProblems(modulepreloadCount, WEB_MODULEPRELOAD_PIN),
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

export async function checkBundleBudgets({
  native = false,
  prerenderedIndex = PRERENDERED_INDEX,
  clientDir = CLIENT_DIR,
  nativeDir = NATIVE_DIR,
  env = process.env,
  log = console.log,
} = {}) {
  // Diagnostic code does not ship, and it can add or merge startup chunks too;
  // release limits describe the artifact enforced by CI's uninstrumented
  // release build (ADR-0032).
  const instrumented = isInstrumentedBuild(env);
  if (native) {
    const measurement = measureNativeExport(nativeDir);
    const countProblems = modulepreloadCountProblems(
      measurement.modulepreloadCount,
      NATIVE_MODULEPRELOAD_PIN
    );
    if (instrumented) {
      for (const problem of countProblems) log(`[bundle-budgets] report-only: ${problem}`);
    }
    const problems = [
      ...nativeExportBudgetProblems(measurement),
      ...(instrumented ? [] : countProblems),
    ];
    if (problems.length) throw new Error(problems.join('\n'));
    log(
      `[bundle-budgets] ${instrumented ? 'instrumented build: the modulepreload count is report-only; ' : ''}native export ${measurement.bytes}/${MAX_NATIVE_EXPORT_BYTES} bytes across ${measurement.fileCount} files (${measurement.modulepreloadCount}/${NATIVE_STARTUP_MODULEPRELOAD_COUNT} index.html modulepreloads)`
    );
    return;
  }

  const measurement = measureWebBundle({
    prerenderedIndex,
    clientDir,
  });
  const problems = webBundleBudgetProblems(measurement);
  if (!instrumented && problems.length) throw new Error(problems.join('\n'));
  for (const problem of problems) log(`[bundle-budgets] report-only: ${problem}`);
  log(
    `[bundle-budgets] ${instrumented ? 'instrumented build: release budgets are report-only; ' : ''}startup JS/CSS ${measurement.startupBytes}/${MAX_STARTUP_JS_CSS_BYTES} bytes across ${measurement.startupFileCount} linked files (${measurement.modulepreloadCount}/${STARTUP_MODULEPRELOAD_COUNT} modulepreloads) + ${measurement.inlineStyleBytes} inline CSS bytes; ` +
      `largest lazy JS ${measurement.largestLazyChunk.bytes}/${MAX_LAZY_CHUNK_BYTES} bytes (${measurement.largestLazyChunk.path})`
  );
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { native: { type: 'boolean' } } });
  runMain(() => checkBundleBudgets({ native: values.native }));
}
