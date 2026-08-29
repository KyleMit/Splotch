import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { listEntries, readEntry } from '../lib/zip.mjs';
import { zip } from './fixtures/zip-writer.mjs';

let dir;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'splotch-zip-'));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('readEntry', () => {
  it('reads both deflated and stored entries, and matches by regex', () => {
    const path = join(dir, 'mixed.zip');
    writeFileSync(
      path,
      zip([
        { name: 'a/deflated.txt', data: Buffer.from('x'.repeat(500)) },
        { name: 'Payload/App.app/Info.plist', data: Buffer.from('stored'), store: true },
      ])
    );

    expect(readEntry(path, 'a/deflated.txt').toString()).toBe('x'.repeat(500));
    expect(readEntry(path, /^Payload\/[^/]+\.app\/Info\.plist$/).toString()).toBe('stored');
    expect(listEntries(path)).toEqual(['a/deflated.txt', 'Payload/App.app/Info.plist']);
  });

  it('fails loudly on a missing entry instead of returning empty', () => {
    const path = join(dir, 'empty.zip');
    writeFileSync(path, zip([{ name: 'other.txt', data: Buffer.from('hi') }]));

    expect(() => readEntry(path, 'base/manifest/AndroidManifest.xml')).toThrow(/no entry/);
  });
});
