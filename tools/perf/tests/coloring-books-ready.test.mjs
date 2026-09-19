import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  COLORING_PACK_CACHE_FAMILY_PREFIX as PRODUCT_CACHE_FAMILY_PREFIX,
  COLORING_PACK_MARKER_PREFIX as PRODUCT_MARKER_PREFIX,
} from '../../../web/src/lib/coloringPacks/cacheKeys.ts';
import { VERSION_JSON_PATH as PRODUCT_VERSION_JSON_PATH } from '../../../web/src/lib/pwa/versionEndpoint.ts';
import {
  BOOK_CHOICE_SELECTOR,
  COLORING_BOOK_INSTALL_STATE_SCRIPT,
  COLORING_PACK_CACHE_FAMILY_PREFIX,
  COLORING_PACK_MANIFEST_PATH_TEMPLATE,
  COLORING_PACK_MARKER_PREFIX,
  VERSION_JSON_PATH,
  installTimeoutMessage,
  listedTimeoutMessage,
  prepareColoringBooks,
} from '../lib/coloring-books-ready.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8');

const CATALOG = ['farm', 'dinosaur', 'creatures'];

function fakeTarget({ installStates, listedCounts }) {
  const calls = [];
  let listedIndex = 0;
  return {
    calls,
    execute: async (script) => {
      if (script === COLORING_BOOK_INSTALL_STATE_SCRIPT) {
        calls.push('read install state');
        return installStates.length > 1 ? installStates.shift() : installStates[0];
      }
      if (script.includes(JSON.stringify(BOOK_CHOICE_SELECTOR))) {
        calls.push('count book choices');
        const listed = listedCounts[Math.min(listedIndex, listedCounts.length - 1)];
        listedIndex += 1;
        return listed;
      }
      throw new Error(`Unexpected script: ${script}`);
    },
    openPicker: async () => calls.push('open picker'),
    closePicker: async () => calls.push('close picker'),
  };
}

describe('prepareColoringBooks', () => {
  it('leaves a target without web pack storage untouched', async () => {
    const target = fakeTarget({ installStates: [null], listedCounts: [] });
    await expect(prepareColoringBooks(target)).resolves.toBeNull();
    expect(target.calls).toEqual(['read install state']);
  });

  it('engages a fresh context through the picker, then waits for every catalog book', async () => {
    const target = fakeTarget({
      installStates: [
        { catalog: CATALOG, missing: ['dinosaur', 'creatures'] },
        { catalog: CATALOG, missing: ['creatures'] },
        { catalog: CATALOG, missing: [] },
      ],
      listedCounts: [3],
    });
    await expect(prepareColoringBooks(target)).resolves.toBe(3);
    expect(target.calls).toEqual([
      'read install state',
      'open picker',
      'close picker',
      'read install state',
      'read install state',
      'open picker',
      'count book choices',
      'close picker',
    ]);
  });

  it('waits for a prepared context to publish the books its storage already holds', async () => {
    const target = fakeTarget({
      installStates: [{ catalog: CATALOG, missing: [] }],
      listedCounts: [0, 0, 3],
    });
    await expect(prepareColoringBooks(target)).resolves.toBe(3);
    expect(target.calls.filter((call) => call === 'count book choices')).toHaveLength(3);
  });

  it('fails with the missing books when the install never finishes', async () => {
    const target = fakeTarget({
      installStates: [{ catalog: CATALOG, missing: ['creatures'] }],
      listedCounts: [3],
    });
    await expect(prepareColoringBooks({ ...target, installTimeoutMs: 20 })).rejects.toThrow(
      'Timed out after 0.02 s waiting for coloring books to install: 1 of 2 extra books installed, missing creatures'
    );
    expect(target.calls).not.toContain('count book choices');
  });

  it('fails with both counts when the picker never lists the installed books', async () => {
    const target = fakeTarget({
      installStates: [{ catalog: CATALOG, missing: [] }],
      listedCounts: [2],
    });
    await expect(prepareColoringBooks({ ...target, listedTimeoutMs: 20 })).rejects.toThrow(
      listedTimeoutMessage(2, 3, 20)
    );
  });

  it('expects no book choice from a catalog of one book', async () => {
    const target = fakeTarget({
      installStates: [{ catalog: ['farm'], missing: [] }],
      listedCounts: [0],
    });
    await expect(prepareColoringBooks(target)).resolves.toBe(0);
  });

  it('names the timeout in seconds', () => {
    expect(installTimeoutMessage({ catalog: CATALOG, missing: ['creatures'] }, 240_000)).toContain(
      'Timed out after 240 s'
    );
  });
});

describe('the in-page install-state script', () => {
  const manifest = { starterBookId: 'farm', books: CATALOG.map((id) => ({ id })) };

  async function runInPage({ cacheEntries, native = false, withCaches = true }) {
    const scope = {
      fetch: async (path) => ({
        ok: true,
        json: async () => (path === VERSION_JSON_PATH ? { version: '9.9.9' } : manifest),
      }),
      caches: withCaches
        ? {
            keys: async () => Object.keys(cacheEntries),
            open: async (name) => ({
              keys: async () =>
                cacheEntries[name].map((path) => ({ url: `http://host.test${path}` })),
            }),
          }
        : undefined,
      Capacitor: native ? { isNativePlatform: () => true } : undefined,
    };
    const run = new Function(
      'fetch',
      'caches',
      'globalThis',
      `return (() => {${COLORING_BOOK_INSTALL_STATE_SCRIPT}})();`
    );
    return run(scope.fetch, scope.caches, { Capacitor: scope.Capacitor });
  }

  it('reports the catalog books with no install marker, never the starter', async () => {
    await expect(
      runInPage({
        cacheEntries: {
          'coloring-packs-v2-full': ['/coloring/.installed/dinosaur', '/coloring/dinosaur/a.webp'],
        },
      })
    ).resolves.toEqual({ catalog: CATALOG, missing: ['creatures'] });
  });

  it('ignores markers in a cache outside the pack family', async () => {
    await expect(
      runInPage({ cacheEntries: { 'some-other-cache': ['/coloring/.installed/dinosaur'] } })
    ).resolves.toEqual({ catalog: CATALOG, missing: ['dinosaur', 'creatures'] });
  });

  it('returns null on a native shell and on an engine without Cache Storage', async () => {
    await expect(runInPage({ cacheEntries: {}, native: true })).resolves.toBeNull();
    await expect(runInPage({ cacheEntries: {}, withCaches: false })).resolves.toBeNull();
  });
});

describe("the harness's copies of the product's pack names", () => {
  it('match the owning web modules', () => {
    expect(VERSION_JSON_PATH).toBe(PRODUCT_VERSION_JSON_PATH);
    expect(COLORING_PACK_CACHE_FAMILY_PREFIX).toBe(PRODUCT_CACHE_FAMILY_PREFIX);
    expect(COLORING_PACK_MARKER_PREFIX).toBe(PRODUCT_MARKER_PREFIX);
  });

  it('builds the manifest path the way the product does', () => {
    const manifestSource = read('web', 'src', 'lib', 'coloringPacks', 'manifest.ts');
    const productTemplate = manifestSource.match(
      /export function coloringPackManifestPath\(appVersion: string\): string \{\s*return `([^`]+)`;/
    )?.[1];
    expect(productTemplate, 'coloringPackManifestPath template literal').toBeDefined();
    expect(COLORING_PACK_MANIFEST_PATH_TEMPLATE).toBe(
      productTemplate.replace('${appVersion}', '{version}')
    );
  });

  it('selects book choices by the label the picker gives a book tile', () => {
    expect(read('web', 'src', 'lib', 'components', 'ColoringBook.svelte')).toContain(
      'aria-label="{book.name} coloring book"'
    );
    expect(BOOK_CHOICE_SELECTOR).toContain('[aria-label$="coloring book"]');
  });
});

describe('where the sweeps settle the installed books', () => {
  const sweep = read('tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs');
  const desktop = read('tools', 'perf', 'web', 'capture-desktop-actions.mjs');

  it('settles them before the first measured action of a sweep', () => {
    const sweepStart = sweep.indexOf('export async function runActionSweep');
    const prepare = sweep.indexOf('await prepareColoringBooks(', sweepStart);
    const firstMeasured = sweep.indexOf('await record(', sweepStart);
    expect(prepare).toBeGreaterThan(sweepStart);
    expect(prepare).toBeLessThan(firstMeasured);
  });

  it('records the listed book count in the plan context the stable-plan check compares', () => {
    expect(sweep).toMatch(/context: \{[^}]*listedColoringBooks,[^}]*\}/s);
  });

  it('gives the desktop capture a browser profile that keeps pack storage across reloads', () => {
    expect(desktop).toContain('engine.launchPersistentContext(profileDir,');
    expect(desktop).not.toContain('browser.newContext(');
    expect(desktop).toContain('rmSync(profileDir, { recursive: true, force: true })');
  });
});
