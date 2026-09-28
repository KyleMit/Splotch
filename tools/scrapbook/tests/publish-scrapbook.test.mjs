import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceWithCopy, resolvePublishDestination } from '../publish-scrapbook.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'splotch-scrapbook-publish-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePublishDestination', () => {
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
    replaceWithCopy(source, dest);
    expect(readFileSync(join(dest, 'index.html'), 'utf8')).toBe('new');
    expect(existsSync(join(dest, 'dropped.html'))).toBe(false);
  });

  it('refuses to replace a directory with a file', () => {
    const source = join(root, 'report.html');
    const dest = join(root, 'scrapbook', 'lighthouse', 'latest');
    writeFileSync(source, 'page');
    writeTree(dest, { 'index.html': 'old' });
    expect(() => replaceWithCopy(source, dest)).toThrow('different kind');
    expect(existsSync(join(dest, 'index.html'))).toBe(true);
  });

  it('refuses a source inside the destination it would delete', () => {
    const dest = join(root, 'scrapbook', 'model-eval', 'report');
    const source = join(dest, 'assets');
    writeTree(source, { 'a.png': 'x' });
    expect(() => replaceWithCopy(source, dest)).toThrow('overlap');
    expect(existsSync(join(source, 'a.png'))).toBe(true);
  });
});
