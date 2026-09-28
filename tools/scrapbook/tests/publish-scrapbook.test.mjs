import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceWithCopy, resolvePublishDestination } from '../publish-scrapbook.mjs';

const TMPDIR_IS_CASE_INSENSITIVE = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'splotch-scrapbook-case-'));
  try {
    writeFileSync(join(dir, 'probe'), '');
    return existsSync(join(dir, 'PROBE'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

let root;
let scrapbook;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'splotch-scrapbook-publish-'));
  scrapbook = join(root, 'scrapbook');
  mkdirSync(scrapbook);
});


afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePublishDestination', () => {
  it('refuses an absolute path even when it lands inside the scrapbook', () => {
    expect(() => resolvePublishDestination(join(root, 'lighthouse', 'latest'), root)).toThrow(
      '<type>/<name>'
    );
  });

  it('accepts a <type>/<name> path inside the scrapbook', () => {
    expect(resolvePublishDestination('lighthouse/latest', root)).toEqual({
      destPath: join(root, 'lighthouse', 'latest'),
      rel: join('lighthouse', 'latest'),
    });
  });

  it.each(['.', '', 'lighthouse', 'lighthouse/', 'a/../b', '../x', '../../etc/x', '/tmp/x/y'])(
    'refuses %j',
    (dest) => {
      expect(() => resolvePublishDestination(dest, root)).toThrow('<type>/<name>');
    }
  );
});

describe('replaceWithCopy', () => {
  function writeTree(dir, files) {
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  }

  it('replaces an existing collection instead of merging into it', () => {
    const source = join(root, 'run');
    const dest = join(root, 'scrapbook', 'lighthouse', 'latest');
    writeTree(source, { 'index.html': 'new' });
    writeTree(dest, { 'index.html': 'old', 'dropped.html': 'stale' });
    replaceWithCopy(source, dest, scrapbook);
    expect(readFileSync(join(dest, 'index.html'), 'utf8')).toBe('new');
    expect(existsSync(join(dest, 'dropped.html'))).toBe(false);
  });

  it('refuses to replace a directory with a file', () => {
    const source = join(root, 'report.html');
    const dest = join(root, 'scrapbook', 'lighthouse', 'latest');
    writeFileSync(source, 'page');
    writeTree(dest, { 'index.html': 'old' });
    expect(() => replaceWithCopy(source, dest, scrapbook)).toThrow('different kind');
    expect(existsSync(join(dest, 'index.html'))).toBe(true);
  });

  it('refuses a destination whose parent symlinks out of the scrapbook', () => {
    const outside = join(root, 'outside');
    writeTree(outside, { 'keep.html': 'mine' });
    symlinkSync(root, join(scrapbook, 'lighthouse'));
    const source = join(root, 'run');
    writeTree(source, { 'index.html': 'new' });
    expect(() => replaceWithCopy(source, join(scrapbook, 'lighthouse', 'outside'), scrapbook)).toThrow(
      'outside scrapbook/'
    );
    expect(existsSync(join(outside, 'keep.html'))).toBe(true);
  });

  it('refuses a source that is a symlink to the destination', () => {
    const dest = join(scrapbook, 'model-eval', 'report');
    writeTree(dest, { 'index.html': 'old' });
    const source = join(root, 'alias');
    symlinkSync(dest, source);
    expect(() => replaceWithCopy(source, dest, scrapbook)).toThrow('overlap');
    expect(existsSync(join(dest, 'index.html'))).toBe(true);
  });

  it.skipIf(!TMPDIR_IS_CASE_INSENSITIVE)('refuses a source that is a case alias of the destination', () => {
    const dest = join(scrapbook, 'model-eval', 'report');
    writeTree(dest, { 'index.html': 'old' });
    expect(() => replaceWithCopy(join(scrapbook, 'Model-Eval', 'Report'), dest, scrapbook)).toThrow(
      'overlap'
    );
    expect(existsSync(join(dest, 'index.html'))).toBe(true);
  });

  it('refuses a source inside the destination it would delete', () => {
    const dest = join(root, 'scrapbook', 'model-eval', 'report');
    const source = join(dest, 'assets');
    writeTree(source, { 'a.png': 'x' });
    expect(() => replaceWithCopy(source, dest, scrapbook)).toThrow('overlap');
    expect(existsSync(join(source, 'a.png'))).toBe(true);
  });
});
