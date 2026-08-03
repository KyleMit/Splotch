import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  filesystemCalls: [],
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

vi.mock('../lib/proc.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  ROOT: state.root,
}));

vi.mock('../../web/src/lib/state/books.ts', () => ({
  BOOKS: [],
  booksForPlatform: () => [],
  bookAssetPaths: (book) => [
    book.cover,
    ...book.pages.flatMap((page) => [
      ...Object.values(page.images),
      ...Object.values(page.colorImages),
      ...Object.values(page.nightImages),
      ...Object.values(page.chalkImages),
    ]),
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

function fixturePage(directory) {
  return {
    id: 'page',
    name: 'Page',
    images: {
      portrait: `/${directory}/page-tall.outline.webp`,
      landscape: `/${directory}/page-wide.outline.webp`,
    },
    colorImages: {
      portrait: `/${directory}/page-tall.light.webp`,
      landscape: `/${directory}/page-wide.light.webp`,
    },
    nightImages: {},
    chalkImages: { portrait: `/${directory}/page-tall.chalk.webp` },
  };
}

function fixtureBook(id, platforms) {
  const directory = `coloring/${id}`;
  return {
    id,
    name: id,
    platforms,
    cover: `/${directory}/cover.outline.webp`,
    pages: [fixturePage(directory)],
  };
}

function writeFixture(path, contents = 'fixture') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

describe('native build script entry points', () => {
  let checkAssets;
  let error;
  let exit;
  let importEffects;
  let log;
  let stripNativeAssets;
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

    ({ stripNativeAssets } = await import('../strip-native-assets.mjs'));
    ({ checkAssets } = await import('../check-assets.mjs'));

    importEffects = {
      errors: [...error.mock.calls],
      exits: [...exit.mock.calls],
      filesystemCalls: [...state.filesystemCalls],
      logs: [...log.mock.calls],
      sentinel: readFileSync(importSentinel, 'utf8'),
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
      exits: [],
      filesystemCalls: [],
      logs: [],
      sentinel: 'keep',
      warnings: [],
    });
  });

  it('strips a temporary native build including directories, files, and HTML references', () => {
    const buildDir = join(state.root, 'orchestration-build');
    const mobileBook = fixtureBook('mobile', ['mobile']);
    const webBook = fixtureBook('web-only', ['web']);
    const webBookDir = join(buildDir, 'coloring', webBook.id);
    const mobileDir = join(buildDir, 'coloring', mobileBook.id);

    writeFixture(join(webBookDir, 'cover.outline.webp'));
    writeFixture(join(buildDir, 'favicon.ico'));
    writeFixture(join(buildDir, 'styles', 'source.svg'));
    writeFixture(join(mobileDir, 'cover.outline.webp'));
    writeFixture(join(mobileDir, 'page-tall.outline.webp'));
    writeFixture(join(mobileDir, 'page-tall.chalk.webp'));
    writeFixture(join(buildDir, 'index.html'), fixtureHtml);
    writeFixture(join(buildDir, 'about', 'index.html'), fixtureHtml);
    exit.mockClear();
    log.mockClear();
    warn.mockClear();

    stripNativeAssets(buildDir, [mobileBook, webBook]);

    expect(exit).not.toHaveBeenCalled();
    expect(existsSync(webBookDir)).toBe(false);
    expect(existsSync(join(buildDir, 'favicon.ico'))).toBe(false);
    expect(existsSync(join(buildDir, 'styles', 'source.svg'))).toBe(false);
    expect(existsSync(join(mobileDir, 'cover.outline.webp'))).toBe(false);
    expect(existsSync(join(mobileDir, 'page-tall.outline.webp'))).toBe(false);
    expect(existsSync(join(mobileDir, 'page-tall.chalk.webp'))).toBe(false);
    expect(readFileSync(join(buildDir, 'index.html'), 'utf8')).not.toContain('favicon.ico');
    expect(readFileSync(join(buildDir, 'about', 'index.html'), 'utf8')).not.toContain('og:title');
    expect(readFileSync(join(buildDir, 'index.html'), 'utf8')).toContain('name="viewport"');
    expect(warn).toHaveBeenCalledWith(
      '[strip-native-assets] expected but not found: large-image.png'
    );
    expect(warn).toHaveBeenCalledWith(
      '[strip-native-assets] expected but not found: /coloring/mobile/page-wide.outline.webp'
    );
    expect(log).toHaveBeenCalledWith('[strip-native-assets] removed /coloring/web-only');
  });

  it('keeps failure paths on exit code 1', () => {
    const missingBuild = join(state.root, 'missing-build');
    const missingStatic = join(state.root, 'missing-static');
    const webBook = fixtureBook('web-only', ['web']);
    exit.mockClear();
    error.mockClear();

    stripNativeAssets(missingBuild, []);
    checkAssets(missingStatic, [webBook], [webBook]);

    expect(exit).toHaveBeenNthCalledWith(1, 1);
    expect(exit).toHaveBeenNthCalledWith(2, 1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[check-assets] PLATFORM MISMATCH:')
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^\[check-assets\] \d+ error\(s\) found/)
    );
    expect(log).not.toHaveBeenCalledWith('[check-assets] all checks passed.');
  });
});
