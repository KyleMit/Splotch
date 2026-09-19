import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  COLORING_PACK_CACHE_FAMILY_PREFIX as PRODUCT_CACHE_FAMILY_PREFIX,
  COLORING_PACK_MARKER_PREFIX as PRODUCT_MARKER_PREFIX,
} from '../../../web/src/lib/coloringPacks/cacheKeys.ts';
import { VERSION_JSON_PATH as PRODUCT_VERSION_JSON_PATH } from '../../../web/src/lib/pwa/versionEndpoint.ts';
import { executePagePromise } from '../ios/capture-xcuitest-screen.mjs';
import {
  BOOK_CHOICE_SELECTOR,
  COLORING_BOOK_INSTALL_STATE_EXPRESSION,
  COLORING_PACK_CACHE_FAMILY_PREFIX,
  COLORING_PACK_MANIFEST_PATH_TEMPLATE,
  COLORING_PACK_MARKER_PREFIX,
  VERSION_JSON_PATH,
  assertPickerNeverOpened,
  firstOpenListedMessage,
  installStateReadTimeoutMessage,
  installTimeoutMessage,
  installedBooksLostMessage,
  listedTimeoutMessage,
  loadSweepDocumentWithColoringBooks,
  pickerAlreadyRenderedMessage,
  prepareColoringBooks,
} from '../lib/coloring-books-ready.mjs';
import {
  COLORING_FIRST_OPEN_ACTION_LABEL,
  COLORING_REOPEN_ACTION_LABEL,
  retiredActionLabelProblem,
} from '../lib/action-applicability.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8');

const CATALOG = ['farm', 'dinosaur', 'creatures'];

function fakeTarget({ installStates, listedCounts }) {
  const calls = [];
  let listedIndex = 0;
  return {
    calls,
    executePromise: async (expression) => {
      expect(expression).toBe(COLORING_BOOK_INSTALL_STATE_EXPRESSION);
      calls.push('read install state');
      return installStates.length > 1 ? installStates.shift() : installStates[0];
    },
    // The synchronous route serializes a Promise as {} on Appium, so the
    // install state must never travel over it.
    execute: async (script) => {
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

  it('fails a first read that never settles instead of hanging the sweep', async () => {
    const target = fakeTarget({ installStates: [null], listedCounts: [] });
    await expect(
      prepareColoringBooks({
        ...target,
        executePromise: () => new Promise(() => {}),
        readTimeoutMs: 20,
      })
    ).rejects.toThrow(installStateReadTimeoutMessage(20));
  });

  it('fails a later read that never settles, inside the install wait', async () => {
    const target = fakeTarget({ installStates: [null], listedCounts: [] });
    let reads = 0;
    await expect(
      prepareColoringBooks({
        ...target,
        executePromise: () => {
          reads += 1;
          return reads === 1
            ? Promise.resolve({ catalog: CATALOG, missing: ['creatures'] })
            : new Promise(() => {});
        },
        readTimeoutMs: 20,
      })
    ).rejects.toThrow(installStateReadTimeoutMessage(20));
    expect(reads).toBe(2);
  });

  it('names the timeout in seconds', () => {
    expect(installTimeoutMessage({ catalog: CATALOG, missing: ['creatures'] }, 240_000)).toContain(
      'Timed out after 240 s'
    );
  });
});

describe('the in-page install-state script', () => {
  const manifest = { starterBookId: 'farm', books: CATALOG.map((id) => ({ id })) };

  async function runInPage({ cacheEntries, native = false, withCaches = true, fetchImpl }) {
    const scope = {
      fetch:
        fetchImpl ??
        (async (path) => ({
          ok: true,
          json: async () => (path === VERSION_JSON_PATH ? { version: '9.9.9' } : manifest),
        })),
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
      `return ${COLORING_BOOK_INSTALL_STATE_EXPRESSION};`
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

  it('hands every fetch a signal it aborts at its own deadline', async () => {
    vi.useFakeTimers();
    try {
      const stalled = runInPage({
        cacheEntries: {},
        fetchImpl: (path, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error(`aborted ${path}`)));
          }),
      });
      const failure = stalled.then(
        () => null,
        (error) => error
      );
      await vi.advanceTimersByTimeAsync(14_999);
      await expect(Promise.race([failure, Promise.resolve('still waiting')])).resolves.toBe(
        'still waiting'
      );
      await vi.advanceTimersByTimeAsync(1);
      expect((await failure)?.message).toBe('aborted /version.json');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null on a native shell and on an engine without Cache Storage', async () => {
    await expect(runInPage({ cacheEntries: {}, native: true })).resolves.toBeNull();
    await expect(runInPage({ cacheEntries: {}, withCaches: false })).resolves.toBeNull();
  });
});

describe('the transport that carries the install state', () => {
  // Models of the two Appium routes. execute/sync hands back whatever the
  // script returned, JSON-serialized, without awaiting it; execute/async calls
  // the script with a completion callback as its last argument.
  const executeSyncModel = async (script) => JSON.parse(JSON.stringify(new Function(script)()));
  const executeAsyncModel = (script) => new Promise((resolve) => new Function(script)(resolve));
  const settled = `Promise.resolve({ catalog: ['farm'], missing: [] })`;

  it('loses a Promise over the synchronous route', async () => {
    await expect(executeSyncModel(`return ${settled};`)).resolves.toEqual({});
  });

  it('delivers the settled value over the callback route the iPad runner uses', async () => {
    await expect(executePagePromise(executeAsyncModel, settled)).resolves.toEqual({
      catalog: ['farm'],
      missing: [],
    });
  });

  it('turns a rejected page promise into a thrown error', async () => {
    await expect(
      executePagePromise(
        executeAsyncModel,
        `Promise.reject(new Error('/version.json answered 404'))`
      )
    ).rejects.toThrow('/version.json answered 404');
  });

  it('is what each runner hands the preparation that reads the install state', () => {
    expect(read('tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs')).toContain(
      'const executePromise = (expression) => executePagePromise(executeAsync, expression);'
    );
    for (const runner of [
      ['tools', 'perf', 'web', 'capture-desktop-actions.mjs'],
      ['tools', 'perf', 'android', 'capture-browser-actions.mjs'],
    ]) {
      expect(read(...runner)).toContain(
        'const executePromise = (expression) => page.evaluate(expression);'
      );
    }
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

  const sweepBody = sweep.slice(sweep.indexOf('export async function runActionSweep'));
  const runners = [
    sweep.slice(sweep.indexOf('export async function runIpadActions')),
    desktop,
    read('tools', 'perf', 'android', 'capture-browser-actions.mjs'),
  ];

  it('never opens the picker for setup inside the sweep that owes a first open', () => {
    expect(sweepBody).not.toContain('prepareColoringBooks(');
    expect(sweepBody).not.toContain('openColoringPickerForSetup(');
  });

  it('settles them in a document each runner loads before the one it sweeps', () => {
    for (const runner of runners) {
      const load = runner.indexOf('await loadActionSweepDocument({');
      const run = runner.indexOf('await runActionSweep({');
      expect(load).toBeGreaterThan(-1);
      expect(load).toBeLessThan(run);
      expect(runner).toContain('listedColoringBooks: sweepDocument.listedColoringBooks,');
      expect(runner).toContain('coloringPreparation.push({ repeat, ...sweepDocument });');
    }
  });

  it('checks the picker never opened, then measures the first open before the reopen', () => {
    const control = sweepBody.indexOf('await assertPickerNeverOpened(execute);');
    const firstOpen = sweepBody.indexOf(
      'await measureColoringPickerOpen(COLORING_FIRST_OPEN_ACTION_LABEL);'
    );
    const listedCheck = sweepBody.indexOf('firstOpenListedMessage(');
    const reopen = sweepBody.indexOf(
      'await measureColoringPickerOpen(COLORING_REOPEN_ACTION_LABEL);'
    );
    expect(control).toBeGreaterThan(-1);
    expect(control).toBeLessThan(firstOpen);
    expect(firstOpen).toBeLessThan(listedCheck);
    expect(listedCheck).toBeLessThan(reopen);
    expect(sweepBody.slice(firstOpen, reopen)).toContain(
      'await closeColoringPickerForSetup(execute);'
    );
  });

  it('measures nothing under the label that never said which open it was', () => {
    expect(sweep).not.toContain("label: 'open coloring books'");
    expect(sweepBody).toContain('retiredActionLabelProblem(sample.label)');
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

describe('loadSweepDocumentWithColoringBooks', () => {
  const installed = { catalog: CATALOG, missing: [] };

  function fakeRunner({ listed, freshDocumentState = installed }) {
    const calls = [];
    return {
      calls,
      loadDocument: async () => calls.push('load document'),
      prepare: async () => {
        calls.push('prepare');
        return listed;
      },
      executePromise: async (expression) => {
        expect(expression).toBe(COLORING_BOOK_INSTALL_STATE_EXPRESSION);
        calls.push('read install state');
        return freshDocumentState;
      },
    };
  }

  it('prepares in one document and hands the sweep the next, with its books still installed', async () => {
    const { calls, ...runner } = fakeRunner({ listed: 3 });
    const result = await loadSweepDocumentWithColoringBooks(runner);
    expect(calls).toEqual(['load document', 'prepare', 'load document', 'read install state']);
    expect(result).toMatchObject({ listedColoringBooks: 3, documentLoads: 2 });
    expect(result.preparationMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps the one document of a target whose preparation never opens the picker', async () => {
    const { calls, ...runner } = fakeRunner({ listed: null });
    await expect(loadSweepDocumentWithColoringBooks(runner)).resolves.toEqual({
      listedColoringBooks: null,
      preparationMs: null,
      documentLoads: 1,
    });
    expect(calls).toEqual(['load document', 'prepare']);
  });

  it('fails by name when the fresh document lost the prepared books', async () => {
    const lost = { catalog: CATALOG, missing: ['dinosaur'] };
    await expect(
      loadSweepDocumentWithColoringBooks(fakeRunner({ listed: 3, freshDocumentState: lost }))
    ).rejects.toThrow(installedBooksLostMessage(lost));
    await expect(
      loadSweepDocumentWithColoringBooks(fakeRunner({ listed: 3, freshDocumentState: null }))
    ).rejects.toThrow(installedBooksLostMessage(null));
  });
});

describe('the control on the first-open measurement', () => {
  it('passes a document whose picker has rendered no tile', async () => {
    await expect(assertPickerNeverOpened(async () => 0)).resolves.toBeUndefined();
  });

  it('refuses a document whose setup already opened the picker', async () => {
    await expect(assertPickerNeverOpened(async () => 8)).rejects.toThrow(
      pickerAlreadyRenderedMessage(8)
    );
  });

  it('counts the tiles the product renders for a held open', () => {
    const picker = read('web', 'src', 'lib', 'components', 'ColoringBook.svelte');
    expect(picker).toContain('id="coloring-book-dialog"');
    expect(picker.match(/class="coloring-tile[ "]/g)).toHaveLength(2);
    expect(picker).toContain('{#each books as book (book.id)}');
    expect(read('web', 'src', 'lib', 'state', 'coloringPicker.svelte.ts')).toContain(
      'const shown = $derived(installed.filter((book) => shownBookIds.includes(book.id)));'
    );
  });

  it('names both counts when the first open lists fewer books than preparation did', () => {
    expect(firstOpenListedMessage(1, 8)).toContain('listed 1 book choices');
    expect(firstOpenListedMessage(1, 8)).toContain('preparation listed 8');
  });
});

describe('the two coloring picker opens', () => {
  it('carry distinct labels, neither of them the retired one', () => {
    expect(COLORING_FIRST_OPEN_ACTION_LABEL).not.toBe(COLORING_REOPEN_ACTION_LABEL);
    for (const label of [COLORING_FIRST_OPEN_ACTION_LABEL, COLORING_REOPEN_ACTION_LABEL]) {
      expect(retiredActionLabelProblem(label)).toBeNull();
    }
  });

  it('refuses the label that never said which open it measured', () => {
    expect(retiredActionLabelProblem('open coloring books')).toContain('is retired');
  });
});
