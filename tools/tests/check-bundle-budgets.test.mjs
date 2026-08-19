import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import {
  MAX_LAZY_CHUNK_BYTES,
  MAX_NATIVE_EXPORT_BYTES,
  MAX_STARTUP_JS_CSS_BYTES,
  measureNativeExport,
  measureWebBundle,
  nativeExportBudgetProblems,
  startupResourceHrefsFromHtml,
  webBundleBudgetProblems,
} from '../check-bundle-budgets.mjs';

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-bundle-budget-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSizedFile(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'x'.repeat(bytes));
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true }));
});

it('reads modulepreload and stylesheet hrefs with structured HTML parsing', () => {
  expect(
    startupResourceHrefsFromHtml(`
      <!doctype html>
      <html><head>
        <link href="./entry.js" crossorigin rel="modulepreload preload">
        <link media="screen" rel='stylesheet' href='./app.css'>
        <link rel="icon" href="./favicon.png">
      </head></html>
    `)
  ).toEqual(['./entry.js', './app.css']);
});

it('measures linked startup resources and the largest non-startup JavaScript chunk', () => {
  const root = temporaryDirectory();
  const clientDir = join(root, 'client');
  const prerenderedIndex = join(root, 'prerendered/pages/index.html');
  writeSizedFile(join(clientDir, '_app/immutable/entry/app.js'), 3);
  writeSizedFile(join(clientDir, '_app/immutable/assets/app.css'), 5);
  writeSizedFile(join(clientDir, '_app/immutable/chunks/lazy.js'), 11);
  writeSizedFile(join(clientDir, '_app/immutable/chunks/small.js'), 7);
  writeSizedFile(prerenderedIndex, 0);
  writeFileSync(
    prerenderedIndex,
    '<link href="./_app/immutable/entry/app.js" rel="modulepreload">' +
      '<link rel="stylesheet" href="./_app/immutable/assets/app.css">' +
      '<link rel="modulepreload" href="./_app/env.js">'
  );

  expect(measureWebBundle({ prerenderedIndex, clientDir })).toEqual({
    startupBytes: 8,
    startupFileCount: 2,
    largestLazyChunk: { path: '_app/immutable/chunks/lazy.js', bytes: 11 },
  });
});

it('rejects startup JS/CSS above its byte budget', () => {
  expect(
    webBundleBudgetProblems({
      startupBytes: MAX_STARTUP_JS_CSS_BYTES + 1,
      largestLazyChunk: { path: 'lazy.js', bytes: MAX_LAZY_CHUNK_BYTES },
    })
  ).toEqual([
    `Startup JS/CSS is ${MAX_STARTUP_JS_CSS_BYTES + 1} bytes, above the ${MAX_STARTUP_JS_CSS_BYTES}-byte budget`,
  ]);
});

it('rejects the largest lazy JavaScript chunk above its byte budget', () => {
  expect(
    webBundleBudgetProblems({
      startupBytes: MAX_STARTUP_JS_CSS_BYTES,
      largestLazyChunk: { path: '_app/immutable/chunks/large.js', bytes: MAX_LAZY_CHUNK_BYTES + 1 },
    })
  ).toEqual([
    `Largest lazy JS chunk is ${MAX_LAZY_CHUNK_BYTES + 1} bytes, above the ${MAX_LAZY_CHUNK_BYTES}-byte budget (_app/immutable/chunks/large.js)`,
  ]);
});

it('measures every file in the native export and rejects an oversized package', () => {
  const nativeDir = temporaryDirectory();
  writeSizedFile(join(nativeDir, 'index.html'), 3);
  writeSizedFile(join(nativeDir, '_app/app.js'), 5);
  expect(measureNativeExport(nativeDir)).toEqual({ bytes: 8, fileCount: 2 });
  expect(nativeExportBudgetProblems({ bytes: MAX_NATIVE_EXPORT_BYTES + 1 })).toEqual([
    `Native static export is ${MAX_NATIVE_EXPORT_BYTES + 1} bytes, above the ${MAX_NATIVE_EXPORT_BYTES}-byte budget`,
  ]);
});

it('is wired into both release build lifecycle hooks', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  expect(packageJson.scripts.postbuild).toContain('node tools/check-bundle-budgets.mjs');
  expect(packageJson.scripts['postbuild:cap']).toContain(
    'node tools/check-bundle-budgets.mjs --native'
  );
});
