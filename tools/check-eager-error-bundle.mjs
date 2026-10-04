import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import { isInstrumentedBuild } from './lib/build-instrumentation.mjs';
import { MAX_STARTUP_JS_CSS_BYTES, startupResourcesFromHtml } from './check-bundle-budgets.mjs';

const OUTPUT_DIR = join(ROOT, 'web/.svelte-kit/output');
const MANIFEST_PATH = join(OUTPUT_DIR, 'client/.vite/manifest.json');
const WEB_CLIENT_DIR = join(OUTPUT_DIR, 'client');
const WEB_INDEX_PATH = join(OUTPUT_DIR, 'prerendered/pages/index.html');
const NATIVE_DIR = join(ROOT, 'web/build');

// Kit starts the root error loader on every route, independently of index.html's
// modulepreloads. These lazy owners must stay out of its static import closure.
const DEFERRED_OWNERS = ['deferredIcons', 'modalDialog.svelte', 'SettingsModal', 'ParentalGate'];

// Chunk names follow web/src module filenames, so a renamed or merged owner
// would otherwise leave an entry that never matches and a check that cannot fail.
function requireDeferredOwnerChunks(manifest) {
  const chunkNames = new Set(Object.values(manifest).map((chunk) => chunk.name));
  const missing = DEFERRED_OWNERS.filter((owner) => !chunkNames.has(owner));
  if (missing.length) {
    throw new Error(
      missing
        .map(
          (owner) =>
            `Deferred owner ${owner} is not a chunk in this manifest: update DEFERRED_OWNERS or restore its lazy boundary`
        )
        .join('\n')
    );
  }
}

export function eagerErrorResources(manifest) {
  const entries = Object.keys(manifest).filter((key) =>
    manifest[key].file?.startsWith('_app/immutable/nodes/1.')
  );
  if (entries.length !== 1) throw new Error('Expected one root error node in the client manifest');
  requireDeferredOwnerChunks(manifest);
  const visited = new Set();
  const resources = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk?.file) throw new Error(`Missing root error dependency in the manifest: ${key}`);
    if (DEFERRED_OWNERS.includes(chunk.name)) {
      throw new Error(`Root error eagerly imports deferred owner ${chunk.name}`);
    }
    resources.add(chunk.file);
    for (const css of chunk.css ?? []) resources.add(css);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(entries[0]);
  return [...resources];
}

export function eagerErrorStartupBytes(linked, error, inlineStyleBytes, sizeOf) {
  return [...new Set([...linked, ...error])].reduce(
    (total, file) => total + sizeOf(file),
    inlineStyleBytes
  );
}

export function checkEagerErrorBundle({
  native = false,
  // Test seams: production reads the output the build for this target wrote.
  manifestPath = MANIFEST_PATH,
  clientDir = native ? NATIVE_DIR : WEB_CLIENT_DIR,
  indexPath = native ? join(clientDir, 'index.html') : WEB_INDEX_PATH,
  env = process.env,
  log = console.log,
} = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { hrefs, inlineStyleBytes } = startupResourcesFromHtml(readFileSync(indexPath, 'utf8'));
  const linked = new Set(
    hrefs.map((href) => new URL(href, 'https://bundle.invalid/').pathname.slice(1))
  );
  const error = eagerErrorResources(manifest);
  const sizeOf = (file) => statSync(join(clientDir, file)).size;
  if (!native) {
    const unionBytes = eagerErrorStartupBytes(linked, error, inlineStyleBytes, sizeOf);
    // The byte budget describes the uninstrumented release artifact (ADR-0032).
    // eagerErrorResources' deferred-owner checks are structural and hold on every build.
    const instrumented = isInstrumentedBuild(env);
    if (unionBytes > MAX_STARTUP_JS_CSS_BYTES) {
      const problem = `Linked and eager-error startup bytes ${unionBytes} exceed ${MAX_STARTUP_JS_CSS_BYTES}`;
      if (!instrumented) throw new Error(problem);
      log(`[eager-error] report-only: ${problem}`);
    }
    log(
      `[eager-error] ${instrumented ? 'instrumented build: the startup byte budget is report-only; ' : ''}linked and error startup union ${unionBytes}/${MAX_STARTUP_JS_CSS_BYTES} bytes`
    );
  }
  const extra = error.filter((file) => !linked.has(file));
  const bytes = extra.reduce((total, file) => total + sizeOf(file), 0);
  log(
    `[eager-error] ${native ? 'native' : 'web'} root error adds ${extra.length} resources / ${bytes} bytes outside the index.html links; deferred owners remain lazy`
  );
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { native: { type: 'boolean' } } });
  runMain(async () => checkEagerErrorBundle({ native: values.native }));
}
