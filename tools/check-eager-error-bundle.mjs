import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import { MAX_STARTUP_JS_CSS_BYTES, startupResourcesFromHtml } from './check-bundle-budgets.mjs';

// Kit starts the root error loader on every route, independently of index.html's
// modulepreloads. These lazy owners must stay out of its static import closure.
const DEFERRED_OWNERS = ['deferredIcons', 'modalDialog.svelte', 'SettingsModal', 'ParentalGate'];

export function eagerErrorResources(manifest) {
  const entries = Object.keys(manifest).filter((key) =>
    manifest[key].file?.startsWith('_app/immutable/nodes/1.')
  );
  if (entries.length !== 1) throw new Error('Expected one root error node in the client manifest');
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
  const bytes = [...new Set([...linked, ...error])].reduce(
    (total, file) => total + sizeOf(file),
    inlineStyleBytes
  );
  if (bytes > MAX_STARTUP_JS_CSS_BYTES) {
    throw new Error(
      `Linked and eager-error startup bytes ${bytes} exceed ${MAX_STARTUP_JS_CSS_BYTES}`
    );
  }
  return bytes;
}

export function checkEagerErrorBundle({ native = false, log = console.log } = {}) {
  const output = join(ROOT, 'web/.svelte-kit/output');
  const manifest = JSON.parse(readFileSync(join(output, 'client/.vite/manifest.json'), 'utf8'));
  const clientDir = native ? join(ROOT, 'web/build') : join(output, 'client');
  const index = native
    ? join(clientDir, 'index.html')
    : join(output, 'prerendered/pages/index.html');
  const { hrefs, inlineStyleBytes } = startupResourcesFromHtml(readFileSync(index, 'utf8'));
  const linked = new Set(
    hrefs.map((href) => new URL(href, 'https://bundle.invalid/').pathname.slice(1))
  );
  const error = eagerErrorResources(manifest);
  const sizeOf = (file) => statSync(join(clientDir, file)).size;
  if (!native) {
    const unionBytes = eagerErrorStartupBytes([...linked], error, inlineStyleBytes, sizeOf);
    log(
      `[eager-error] linked and error startup union ${unionBytes}/${MAX_STARTUP_JS_CSS_BYTES} bytes`
    );
  }
  const extra = error.filter((file) => !linked.has(file));
  const bytes = extra.reduce((total, file) => total + statSync(join(clientDir, file)).size, 0);
  log(
    `[eager-error] ${native ? 'native' : 'web'} root error adds ${extra.length} resources / ${bytes} bytes outside the index.html links; deferred owners remain lazy`
  );
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { native: { type: 'boolean' } } });
  runMain(async () => checkEagerErrorBundle({ native: values.native }));
}
