import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import {
  checkBundleBudgets,
  MAX_LAZY_CHUNK_BYTES,
  MAX_NATIVE_EXPORT_BYTES,
  MAX_STARTUP_JS_CSS_BYTES,
  measureNativeExport,
  measureWebBundle,
  nativeExportBudgetProblems,
  STARTUP_MODULEPRELOAD_COUNT,
  startupResourcesFromHtml,
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

it('reads startup links and inline CSS with structured HTML parsing', () => {
  expect(
    startupResourcesFromHtml(`
      <!doctype html>
      <html><head>
        <link href="./entry.js" crossorigin rel="modulepreload preload">
        <link media="screen" rel='stylesheet' href='./app.css'>
        <link rel="stylesheet" href="./navigation.css" disabled media="(max-width: 0)">
        <link rel="icon" href="./favicon.png">
        <style>a{content:"é"}</style>
      </head></html>
    `)
  ).toEqual({
    hrefs: ['./entry.js', './app.css'],
    modulepreloadCount: 1,
    inlineStyleBytes: Buffer.byteLength('a{content:"é"}'),
  });
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
      '<link rel="stylesheet" href="./_app/immutable/assets/navigation.css" disabled>' +
      '<style>a{b:c}</style>'
  );

  expect(measureWebBundle({ prerenderedIndex, clientDir })).toEqual({
    startupBytes: 14,
    startupFileCount: 2,
    modulepreloadCount: 1,
    inlineStyleBytes: 6,
    largestLazyChunk: { path: '_app/immutable/chunks/lazy.js', bytes: 11 },
  });
});

it('rejects startup JS/CSS above its byte budget', () => {
  expect(
    webBundleBudgetProblems({
      startupBytes: MAX_STARTUP_JS_CSS_BYTES + 1,
      modulepreloadCount: STARTUP_MODULEPRELOAD_COUNT,
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
      modulepreloadCount: STARTUP_MODULEPRELOAD_COUNT,
      largestLazyChunk: { path: '_app/immutable/chunks/large.js', bytes: MAX_LAZY_CHUNK_BYTES + 1 },
    })
  ).toEqual([
    `Largest lazy JS chunk is ${MAX_LAZY_CHUNK_BYTES + 1} bytes, above the ${MAX_LAZY_CHUNK_BYTES}-byte budget (_app/immutable/chunks/large.js)`,
  ]);
});

it.each([
  {
    modulepreloadCount: STARTUP_MODULEPRELOAD_COUNT + 1,
    remedy: 'raise STARTUP_MODULEPRELOAD_COUNT',
  },
  {
    modulepreloadCount: STARTUP_MODULEPRELOAD_COUNT - 1,
    remedy: 'lower STARTUP_MODULEPRELOAD_COUNT',
  },
])(
  'rejects a startup modulepreload count that moved from its pin: $modulepreloadCount',
  ({ modulepreloadCount, remedy }) => {
    const problems = webBundleBudgetProblems({
      startupBytes: MAX_STARTUP_JS_CSS_BYTES,
      modulepreloadCount,
      largestLazyChunk: { path: 'lazy.js', bytes: MAX_LAZY_CHUNK_BYTES },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      `The prerendered / page modulepreloads ${modulepreloadCount} chunks`
    );
    expect(problems[0]).toContain(remedy);
  }
);

it('measures every file in the native export and rejects an oversized package', () => {
  const nativeDir = temporaryDirectory();
  writeSizedFile(join(nativeDir, 'index.html'), 3);
  writeSizedFile(join(nativeDir, '_app/app.js'), 5);
  expect(measureNativeExport(nativeDir)).toEqual({ bytes: 8, fileCount: 2 });
  expect(nativeExportBudgetProblems({ bytes: MAX_NATIVE_EXPORT_BYTES + 1 })).toEqual([
    `Native static export is ${MAX_NATIVE_EXPORT_BYTES + 1} bytes, above the ${MAX_NATIVE_EXPORT_BYTES}-byte budget`,
  ]);
});

it.each([{}, { PERF_MARKS: 'false' }, { PERF_MARKS: '1' }, { PUBLIC_ENABLE_DEV_HARNESS: '1' }])(
  'rejects an oversized web bundle without explicit profiling: %j',
  async (env) => {
    const root = temporaryDirectory();
    const clientDir = join(root, 'client');
    const prerenderedIndex = join(root, 'prerendered/pages/index.html');
    writeSizedFile(join(clientDir, '_app/immutable/entry/app.js'), MAX_STARTUP_JS_CSS_BYTES + 1);
    writeSizedFile(join(clientDir, '_app/immutable/chunks/lazy.js'), 1);
    mkdirSync(dirname(prerenderedIndex), { recursive: true });
    writeFileSync(
      prerenderedIndex,
      '<link href="./_app/immutable/entry/app.js" rel="modulepreload">'
    );

    await expect(
      checkBundleBudgets({ prerenderedIndex, clientDir, env, log: vi.fn() })
    ).rejects.toThrow(
      `Startup JS/CSS is ${MAX_STARTUP_JS_CSS_BYTES + 1} bytes, above the ${MAX_STARTUP_JS_CSS_BYTES}-byte budget`
    );
  }
);

it.each([
  { PERF_MARKS: 'true' },
  { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
  { PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' },
])('reports oversized instrumented startup and lazy chunks: %j', async (env) => {
  const root = temporaryDirectory();
  const clientDir = join(root, 'client');
  const prerenderedIndex = join(root, 'prerendered/pages/index.html');
  writeSizedFile(join(clientDir, '_app/immutable/entry/app.js'), MAX_STARTUP_JS_CSS_BYTES + 1);
  writeSizedFile(join(clientDir, '_app/immutable/chunks/lazy.js'), MAX_LAZY_CHUNK_BYTES + 1);
  mkdirSync(dirname(prerenderedIndex), { recursive: true });
  writeFileSync(
    prerenderedIndex,
    '<link href="./_app/immutable/entry/app.js" rel="modulepreload">'
  );
  const log = vi.fn();

  await checkBundleBudgets({ prerenderedIndex, clientDir, env, log });

  expect(log).toHaveBeenCalledWith(
    `[bundle-budgets] report-only: Startup JS/CSS is ${MAX_STARTUP_JS_CSS_BYTES + 1} bytes, above the ${MAX_STARTUP_JS_CSS_BYTES}-byte budget`
  );
  expect(log).toHaveBeenCalledWith(
    `[bundle-budgets] report-only: Largest lazy JS chunk is ${MAX_LAZY_CHUNK_BYTES + 1} bytes, above the ${MAX_LAZY_CHUNK_BYTES}-byte budget (_app/immutable/chunks/lazy.js)`
  );
  expect(log).toHaveBeenCalledWith(
    `[bundle-budgets] instrumented build: release budgets are report-only; startup JS/CSS ${MAX_STARTUP_JS_CSS_BYTES + 1}/${MAX_STARTUP_JS_CSS_BYTES} bytes across 1 linked files (1/${STARTUP_MODULEPRELOAD_COUNT} modulepreloads) + 0 inline CSS bytes; largest lazy JS ${MAX_LAZY_CHUNK_BYTES + 1}/${MAX_LAZY_CHUNK_BYTES} bytes (_app/immutable/chunks/lazy.js)`
  );
});

function writeStartupPage(modulepreloadCount) {
  const root = temporaryDirectory();
  const clientDir = join(root, 'client');
  const prerenderedIndex = join(root, 'prerendered/pages/index.html');
  const links = Array.from({ length: modulepreloadCount }, (_, index) => {
    const chunk = `_app/immutable/chunks/startup-${index}.js`;
    writeSizedFile(join(clientDir, chunk), 1);
    return `<link href="./${chunk}" rel="modulepreload">`;
  });
  writeSizedFile(join(clientDir, '_app/immutable/chunks/lazy.js'), 1);
  mkdirSync(dirname(prerenderedIndex), { recursive: true });
  writeFileSync(prerenderedIndex, links.join(''));
  return { clientDir, prerenderedIndex };
}

it('passes a release build that modulepreloads the pinned number of chunks', async () => {
  const log = vi.fn();

  await checkBundleBudgets({ ...writeStartupPage(STARTUP_MODULEPRELOAD_COUNT), env: {}, log });

  expect(log).toHaveBeenCalledWith(
    expect.stringContaining(
      `(${STARTUP_MODULEPRELOAD_COUNT}/${STARTUP_MODULEPRELOAD_COUNT} modulepreloads)`
    )
  );
});

it('rejects a release build that modulepreloads one more chunk than its pin', async () => {
  await expect(
    checkBundleBudgets({
      ...writeStartupPage(STARTUP_MODULEPRELOAD_COUNT + 1),
      env: {},
      log: vi.fn(),
    })
  ).rejects.toThrow(
    `The prerendered / page modulepreloads ${STARTUP_MODULEPRELOAD_COUNT + 1} chunks, up from ${STARTUP_MODULEPRELOAD_COUNT}`
  );
});

it.each([{ PERF_MARKS: 'true' }, { PUBLIC_ENABLE_DEV_HARNESS: 'true' }])(
  'only reports an instrumented build whose modulepreload count moved: %j',
  async (env) => {
    const log = vi.fn();

    await checkBundleBudgets({ ...writeStartupPage(STARTUP_MODULEPRELOAD_COUNT + 1), env, log });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `[bundle-budgets] report-only: The prerendered / page modulepreloads ${STARTUP_MODULEPRELOAD_COUNT + 1} chunks`
      )
    );
  }
);

it.each([{ PERF_MARKS: 'true' }, { PUBLIC_ENABLE_DEV_HARNESS: 'true' }])(
  'still rejects missing startup resources in an instrumented build: %j',
  async (env) => {
    const root = temporaryDirectory();
    const clientDir = join(root, 'client');
    const prerenderedIndex = join(root, 'index.html');
    writeFileSync(
      prerenderedIndex,
      '<link href="./_app/immutable/entry/missing.js" rel="modulepreload">'
    );

    await expect(
      checkBundleBudgets({ prerenderedIndex, clientDir, env, log: vi.fn() })
    ).rejects.toThrow('Startup resource does not exist');
  }
);

it.each([{}, { PERF_MARKS: 'true' }, { PUBLIC_ENABLE_DEV_HARNESS: 'true' }])(
  'rejects a prerendered page that waits on the runtime env module: %j',
  async (env) => {
    const root = temporaryDirectory();
    const clientDir = join(root, 'client');
    const prerenderedIndex = join(root, 'index.html');
    writeSizedFile(join(clientDir, '_app/immutable/entry/app.js'), 1);
    writeSizedFile(join(clientDir, '_app/immutable/chunks/lazy.js'), 1);
    // SvelteKit emits this preload beside its boot script's dynamic import of the
    // same module; the import form is omitted because tool-specifier-resolution
    // reads a quoted dynamic import here as a broken relative specifier.
    writeFileSync(
      prerenderedIndex,
      '<link href="./_app/immutable/entry/app.js" rel="modulepreload">' +
        '<link href="./_app/env.js" rel="modulepreload">'
    );

    await expect(
      checkBundleBudgets({ prerenderedIndex, clientDir, env, log: vi.fn() })
    ).rejects.toThrow('a client module imports $env/dynamic/public');
  }
);

it.each([{}, { PERF_MARKS: 'true' }, { PUBLIC_ENABLE_DEV_HARNESS: 'true' }])(
  'rejects an oversized native export: %j',
  async (env) => {
    const nativeDir = temporaryDirectory();
    writeSizedFile(join(nativeDir, 'index.html'), MAX_NATIVE_EXPORT_BYTES + 1);

    await expect(
      checkBundleBudgets({ native: true, nativeDir, env, log: vi.fn() })
    ).rejects.toThrow(
      `Native static export is ${MAX_NATIVE_EXPORT_BYTES + 1} bytes, above the ${MAX_NATIVE_EXPORT_BYTES}-byte budget`
    );
  }
);

it('keeps CI release build validation explicitly uninstrumented', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/test.yml', import.meta.url),
    'utf8'
  );
  expect(workflow.split('\n').map((line) => line.trim())).toContain(
    'run: env -u PERF_MARKS -u PUBLIC_ENABLE_DEV_HARNESS npm run build'
  );
});

it('is wired into both release build lifecycle hooks', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  expect(packageJson.scripts.postbuild).toContain('node tools/check-bundle-budgets.mjs');
  expect(packageJson.scripts['postbuild:cap']).toContain(
    'node tools/check-bundle-budgets.mjs --native'
  );
});
