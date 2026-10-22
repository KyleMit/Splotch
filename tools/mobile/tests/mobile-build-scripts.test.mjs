import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  books: [],
  directEntry: false,
  filesystemCalls: [],
  isMainInputs: [],
  mobileEligibleBooks: [],
  root: '',
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const tracked = (name) =>
    function (...args) {
      state.filesystemCalls.push(name);
      return actual[name](...args);
    };
  return {
    ...actual,
    existsSync: tracked('existsSync'),
    globSync: tracked('globSync'),
    readFileSync: tracked('readFileSync'),
    rmSync: tracked('rmSync'),
    statSync: tracked('statSync'),
    writeFileSync: tracked('writeFileSync'),
  };
});

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ROOT: state.root,
    isMain: (url) => {
      state.isMainInputs.push(url);
      return state.directEntry && typeof url === 'string';
    },
  };
});

vi.mock('../../../src/lib/state/books.ts', () => ({
  BOOKS: state.books,
  RESPONSIVE_COLORING_TIER_DIRECTORIES: ['/coloring/max-1152px', '/coloring/max-240px'],
  booksForPlatform: () => state.mobileEligibleBooks,
  bookAssetPaths: (book) => [
    book.cover,
    ...book.pages.flatMap((page) => [
      ...Object.values(page.lightLineArt),
      ...Object.values(page.lightFill),
      ...Object.values(page.nightFill),
      ...Object.values(page.darkLineArt),
    ]),
    `/coloring/max-1152px/${book.id}/page-tall.overlay.webp`,
    `/coloring/max-240px/${book.id}/page-tall.thumb.webp`,
  ],
}));

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const checkAssetsScript = join(repoRoot, 'tools', 'check-coloring-assets.mjs');

function fixturePage(directory) {
  return {
    id: 'page',
    name: 'Page',
    lightLineArt: {
      portrait: `/${directory}/page-tall.overlay.svg`,
      landscape: `/${directory}/page-wide.overlay.svg`,
    },
    lightFill: {
      portrait: `/${directory}/page-tall.light.webp`,
      landscape: `/${directory}/page-wide.light.webp`,
    },
    nightFill: {},
    darkLineArt: { portrait: `/${directory}/page-tall.dark.overlay.svg` },
  };
}

function fixtureBook(id, platforms) {
  const directory = `coloring/${id}`;
  return {
    id,
    name: id,
    platforms,
    cover: `/${directory}/cover.overlay.svg`,
    darkCover: `/${directory}/cover.dark.overlay.svg`,
    pages: [fixturePage(directory)],
  };
}

function catalogAssetPaths(book) {
  return [
    book.cover,
    ...book.pages.flatMap((page) => [
      ...Object.values(page.lightLineArt),
      ...Object.values(page.lightFill),
      ...Object.values(page.nightFill),
      ...Object.values(page.darkLineArt),
    ]),
    `/coloring/max-1152px/${book.id}/page-tall.overlay.webp`,
    `/coloring/max-240px/${book.id}/page-tall.thumb.webp`,
  ];
}

function writeFixture(path, contents = 'fixture') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

describe('coloring asset check entry point', () => {
  let checkAssets;
  let error;
  let exit;
  let importEffects;
  let log;
  let warn;

  beforeAll(async () => {
    state.root = mkdtempSync(join(tmpdir(), 'splotch-native-build-scripts-'));
    const importSentinel = join(state.root, 'web', 'build', 'favicon.ico');
    writeFixture(importSentinel, 'keep');

    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.filesystemCalls.length = 0;
    state.isMainInputs.length = 0;

    ({ checkAssets } = await import('../../check-coloring-assets.mjs'));

    const filesystemCalls = [...state.filesystemCalls];
    const sentinel = readFileSync(importSentinel, 'utf8');
    importEffects = {
      errors: [...error.mock.calls],
      entryArguments: [...state.isMainInputs],
      exits: [...exit.mock.calls],
      filesystemCalls,
      logs: [...log.mock.calls],
      sentinel,
      warnings: [...warn.mock.calls],
    };
  });

  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(state.root, { recursive: true, force: true });
  });

  it('imports without filesystem work, output, or process exit', () => {
    expect(importEffects).toEqual({
      errors: [],
      entryArguments: [expect.stringMatching(/^file:.*check-coloring-assets\.mjs$/)],
      exits: [],
      filesystemCalls: [],
      logs: [],
      sentinel: 'keep',
      warnings: [],
    });
  });

  it('runs the guarded entry branch with a URL argument', async () => {
    exit.mockClear();
    log.mockClear();
    state.books.length = 0;
    state.directEntry = true;
    state.isMainInputs.length = 0;
    state.mobileEligibleBooks = [];

    try {
      vi.resetModules();
      ({ checkAssets } = await import('../../check-coloring-assets.mjs'));
    } finally {
      state.directEntry = false;
    }

    expect(state.isMainInputs).toEqual([
      expect.stringMatching(/^file:.*check-coloring-assets\.mjs$/),
    ]);
    expect(log).toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
    expect(exit).not.toHaveBeenCalled();
  });

  it('runs the real asset-check CLI', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', checkAssetsScript],
      { cwd: repoRoot, encoding: 'utf8' }
    );

    // Stderr first: a failing check's own line is there, and the status
    // assertion alone would report only `expected 1 to be +0`.
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[check-coloring-assets] all checks passed.');
  });

  it('throws exported-function failures before the CLI wrapper handles them', () => {
    const missingStatic = join(state.root, 'missing-static');
    const webBook = fixtureBook('web-only', ['web']);
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    expect(() => checkAssets(missingStatic, [webBook], [webBook])).toThrow(
      /^\[check-coloring-assets\] \d+ error\(s\) found/
    );

    expect(exit).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[check-coloring-assets] PLATFORM MISMATCH:')
    );
    expect(log).not.toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
  });

  it('translates a direct-entry failure to exit code 1', async () => {
    const webBook = fixtureBook('web-only-direct', ['web']);
    state.books.splice(0, state.books.length, webBook);
    state.directEntry = true;
    state.mobileEligibleBooks = [webBook];
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    try {
      vi.resetModules();
      await import('../../check-coloring-assets.mjs');
    } finally {
      state.books.length = 0;
      state.directEntry = false;
      state.mobileEligibleBooks = [];
    }

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^\[check-coloring-assets\] \d+ error\(s\) found/)
    );
    expect(log).not.toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
  });

  it('reports success for a complete catalog', () => {
    const staticDir = join(state.root, 'complete-static');
    const mobileBook = fixtureBook('mobile-complete', ['mobile']);
    for (const assetPath of catalogAssetPaths(mobileBook)) {
      writeFixture(join(staticDir, assetPath));
    }
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    expect(() => checkAssets(staticDir, [mobileBook], [mobileBook])).not.toThrow();

    expect(exit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
  });

  it('fails when the static tree contains an unreferenced coloring asset', () => {
    const staticDir = join(state.root, 'orphan-static');
    const mobileBook = fixtureBook('mobile-orphan', ['mobile']);
    for (const assetPath of catalogAssetPaths(mobileBook)) {
      writeFixture(join(staticDir, assetPath));
    }
    writeFixture(join(staticDir, 'coloring', mobileBook.id, 'orphan.overlay.webp'));
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    expect(() => checkAssets(staticDir, [mobileBook], [mobileBook])).toThrow(
      /^\[check-coloring-assets\] \d+ error\(s\) found/
    );

    expect(error).toHaveBeenCalledWith(
      `[check-coloring-assets] UNREFERENCED: coloring/${mobileBook.id}/orphan.overlay.webp`
    );
    expect(log).not.toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
  });

  it('fails when an authoring doc sits in the publicly served static tree', () => {
    const staticDir = join(state.root, 'doc-static');
    const mobileBook = fixtureBook('mobile-doc', ['mobile']);
    for (const assetPath of catalogAssetPaths(mobileBook)) {
      writeFixture(join(staticDir, assetPath));
    }
    writeFixture(join(staticDir, 'coloring', 'PLANNING.md'), '# internal notes');
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    expect(() => checkAssets(staticDir, [mobileBook], [mobileBook])).toThrow(
      /^\[check-coloring-assets\] \d+ error\(s\) found/
    );

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[check-coloring-assets] PUBLISHED DOC: coloring/PLANNING.md')
    );
    expect(log).not.toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
  });
});
