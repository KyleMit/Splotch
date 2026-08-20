import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

vi.mock('../../../web/src/lib/state/books.ts', () => ({
  BOOKS: state.books,
  STARTER_COLORING_BOOK_ID: 'mobile',
  RESPONSIVE_COLORING_TIER_DIRECTORIES: ['/coloring/max-1152px', '/coloring/max-240px'],
  booksForPlatform: () => state.mobileEligibleBooks,
  bookAssetPaths: (book) => [
    book.cover,
    ...book.pages.flatMap((page) => [
      ...Object.values(page.images),
      ...Object.values(page.colorImages),
      ...Object.values(page.nightImages),
      ...Object.values(page.darkImages),
    ]),
    `/coloring/max-1152px/${book.id}/page-tall.overlay.webp`,
    `/coloring/max-240px/${book.id}/page-tall.thumb.webp`,
  ],
}));

const fixtureHtml = `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico">
    <meta property="og:title" content="Splotch">
    <meta name="viewport" content="width=device-width">
  </head>
</html>
`;
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const checkAssetsScript = join(repoRoot, 'tools', 'check-coloring-assets.mjs');

function fixturePage(directory) {
  return {
    id: 'page',
    name: 'Page',
    images: {
      portrait: `/${directory}/page-tall.overlay.svg`,
      landscape: `/${directory}/page-wide.overlay.svg`,
    },
    colorImages: {
      portrait: `/${directory}/page-tall.light.webp`,
      landscape: `/${directory}/page-wide.light.webp`,
    },
    nightImages: {},
    darkImages: { portrait: `/${directory}/page-tall.dark.overlay.svg` },
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
      ...Object.values(page.images),
      ...Object.values(page.colorImages),
      ...Object.values(page.nightImages),
      ...Object.values(page.darkImages),
    ]),
    `/coloring/max-1152px/${book.id}/page-tall.overlay.webp`,
    `/coloring/max-240px/${book.id}/page-tall.thumb.webp`,
  ];
}

function writeFixture(path, contents = 'fixture') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function copyRepoFile(fixtureRoot, relativePath) {
  const destination = join(fixtureRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(repoRoot, relativePath), destination);
}

describe('mobile build script entry points', () => {
  let checkAssets;
  let error;
  let exit;
  let importEffects;
  let log;
  let stripStaticAssets;
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

    ({ stripStaticAssets } = await import('../strip-static-assets.mjs'));
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
      entryArguments: [
        expect.stringMatching(/^file:.*strip-static-assets\.mjs$/),
        expect.stringMatching(/^file:.*check-coloring-assets\.mjs$/),
      ],
      exits: [],
      filesystemCalls: [],
      logs: [],
      sentinel: 'keep',
      warnings: [],
    });
  });

  it('runs both guarded entry branches with URL arguments', async () => {
    const directBuildDir = join(state.root, 'web', 'build');
    writeFixture(join(directBuildDir, 'favicon.ico'));
    exit.mockClear();
    log.mockClear();
    state.books.length = 0;
    state.directEntry = true;
    state.isMainInputs.length = 0;
    state.mobileEligibleBooks = [];

    try {
      vi.resetModules();
      ({ stripStaticAssets } = await import('../strip-static-assets.mjs'));
      ({ checkAssets } = await import('../../check-coloring-assets.mjs'));
    } finally {
      state.directEntry = false;
    }

    expect(state.isMainInputs).toEqual([
      expect.stringMatching(/^file:.*strip-static-assets\.mjs$/),
      expect.stringMatching(/^file:.*check-coloring-assets\.mjs$/),
    ]);
    expect(existsSync(join(directBuildDir, 'favicon.ico'))).toBe(false);
    expect(log).toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
    expect(exit).not.toHaveBeenCalled();
  });

  it('runs the real asset-check CLI', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', checkAssetsScript],
      { cwd: repoRoot, encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('[check-coloring-assets] all checks passed.');
  });

  it('runs the real static-strip CLI against an isolated build', () => {
    const fixtureRoot = join(state.root, 'strip-cli');
    for (const relativePath of [
      'tools/mobile/strip-static-assets.mjs',
      'tools/lib/coloring-book-assets.mjs',
      'tools/mobile/lib/static-export.mjs',
      'tools/lib/proc.mjs',
    ]) {
      copyRepoFile(fixtureRoot, relativePath);
    }
    writeFixture(
      join(fixtureRoot, 'web', 'src', 'lib', 'state', 'books.ts'),
      'export const BOOKS = [];\n' +
        'export const STARTER_COLORING_BOOK_ID = "farm";\n' +
        'export const RESPONSIVE_COLORING_TIER_DIRECTORIES = [];\n' +
        'export const bookAssetPaths = () => [];\n'
    );
    const favicon = join(fixtureRoot, 'web', 'build', 'favicon.ico');
    writeFixture(favicon);

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning',
        join(fixtureRoot, 'tools', 'mobile', 'strip-static-assets.mjs'),
      ],
      { cwd: fixtureRoot, encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[strip-static-assets] stripped 1 web-only file(s)');
    expect(existsSync(favicon)).toBe(false);
  });

  it('strips a temporary native build including directories, files, and HTML references', () => {
    const buildDir = join(state.root, 'orchestration-build');
    const mobileBook = fixtureBook('mobile', ['mobile']);
    const downloadableBook = fixtureBook('downloadable', ['mobile']);
    const webBook = fixtureBook('web-only', ['web']);
    const webBookDir = join(buildDir, 'coloring', webBook.id);
    const mobileDir = join(buildDir, 'coloring', mobileBook.id);
    const downloadableDir = join(buildDir, 'coloring', downloadableBook.id);

    writeFixture(join(webBookDir, 'cover.overlay.svg'));
    writeFixture(join(buildDir, 'favicon.ico'));
    writeFixture(join(mobileDir, 'cover.overlay.svg'));
    writeFixture(join(mobileDir, 'cover.dark.overlay.svg'));
    writeFixture(join(mobileDir, 'page-tall.overlay.svg'));
    writeFixture(join(mobileDir, 'page-tall.dark.overlay.svg'));
    writeFixture(join(downloadableDir, 'cover.overlay.svg'));
    writeFixture(join(buildDir, 'coloring', 'max-1152px', 'mobile', 'page-tall.overlay.webp'));
    writeFixture(join(buildDir, 'coloring', 'max-240px', 'mobile', 'page-tall.thumb.webp'));
    writeFixture(join(buildDir, 'index.html'), fixtureHtml);
    writeFixture(join(buildDir, 'about', 'index.html'), fixtureHtml);
    exit.mockClear();
    log.mockClear();
    warn.mockClear();

    stripStaticAssets(buildDir, [mobileBook, downloadableBook, webBook]);

    expect(exit).not.toHaveBeenCalled();
    expect(existsSync(webBookDir)).toBe(false);
    expect(existsSync(join(buildDir, 'favicon.ico'))).toBe(false);
    expect(existsSync(join(mobileDir, 'cover.overlay.svg'))).toBe(false);
    expect(existsSync(join(mobileDir, 'cover.dark.overlay.svg'))).toBe(false);
    expect(existsSync(join(mobileDir, 'page-tall.overlay.svg'))).toBe(false);
    expect(existsSync(join(mobileDir, 'page-tall.dark.overlay.svg'))).toBe(false);
    expect(existsSync(downloadableDir)).toBe(false);
    expect(existsSync(join(buildDir, 'coloring', 'max-1152px'))).toBe(false);
    expect(existsSync(join(buildDir, 'coloring', 'max-240px'))).toBe(false);
    expect(readFileSync(join(buildDir, 'index.html'), 'utf8')).not.toContain('favicon.ico');
    expect(readFileSync(join(buildDir, 'about', 'index.html'), 'utf8')).not.toContain('og:title');
    expect(readFileSync(join(buildDir, 'index.html'), 'utf8')).toContain('name="viewport"');
    expect(warn).toHaveBeenCalledWith(
      '[strip-static-assets] expected but not found: large-image.png'
    );
    expect(warn).toHaveBeenCalledWith(
      '[strip-static-assets] expected but not found: /coloring/mobile/page-wide.overlay.svg'
    );
    expect(log).toHaveBeenCalledWith('[strip-static-assets] removed /coloring/web-only');
    expect(log).toHaveBeenCalledWith(
      '[strip-static-assets] stripped 1/1 downloadable coloring book(s), 0.00 MB freed.'
    );
    expect(log).toHaveBeenCalledWith(
      '[strip-static-assets] stripped 1/1 canonical folder(s) for 1 web-only book(s): web-only'
    );
    expect(log).toHaveBeenCalledWith(
      '[strip-static-assets] stripped 2/2 web-responsive coloring tier root(s).'
    );
  });

  it('throws exported-function failures before the CLI wrapper handles them', () => {
    const missingBuild = `${state.root}-missing-build`;
    const missingStatic = join(state.root, 'missing-static');
    const webBook = fixtureBook('web-only', ['web']);
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    expect(() => stripStaticAssets(missingBuild, [])).toThrow(
      `[strip-static-assets] no build output at ${missingBuild}`
    );
    expect(() => checkAssets(missingStatic, [webBook], [webBook])).toThrow(
      /^\[check-coloring-assets\] \d+ error\(s\) found/
    );

    expect(exit).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[check-coloring-assets] PLATFORM MISMATCH:')
    );
    expect(log).not.toHaveBeenCalledWith('[check-coloring-assets] all checks passed.');
  });

  it('translates direct-entry failures to exit code 1', async () => {
    const webBook = fixtureBook('web-only-direct', ['web']);
    rmSync(join(state.root, 'web', 'build'), { recursive: true, force: true });
    state.books.splice(0, state.books.length, webBook);
    state.directEntry = true;
    state.mobileEligibleBooks = [webBook];
    exit.mockClear();
    error.mockClear();
    log.mockClear();

    try {
      vi.resetModules();
      await import('../strip-static-assets.mjs');
      await import('../../check-coloring-assets.mjs');
    } finally {
      state.books.length = 0;
      state.directEntry = false;
      state.mobileEligibleBooks = [];
    }

    expect(exit).toHaveBeenNthCalledWith(1, 1);
    expect(exit).toHaveBeenNthCalledWith(2, 1);
    expect(error).toHaveBeenCalledWith('[strip-static-assets] no build output at web/build');
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
