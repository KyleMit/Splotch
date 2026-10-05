import { afterAll, describe, expect, it, vi } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { R8_MAPPING, releaseBundle } from './fixtures/release-bundle.mjs';
import { readAabR8Metadata } from '../lib/aab-r8-mapping.mjs';
import { inspectArtifacts } from '../publish-release-artifacts.mjs';

const fixture = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'splotch-r8-'));
  return { dir, aabPath: join(dir, 'app-release.aab') };
});
vi.mock('../../mobile/android/lib/android-toolchain.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  get RELEASE_AAB() {
    return fixture.aabPath;
  },
}));

afterAll(() => rmSync(fixture.dir, { recursive: true, force: true }));

const expected = { version: '1.6.0', versionCode: 8 };

function writeBundle(mapping) {
  writeFileSync(fixture.aabPath, releaseBundle({ mapping }));
}

describe('Android release mapping verification', () => {
  it('accepts a version-matching bundle with embedded R8 class mappings', () => {
    writeBundle(R8_MAPPING);
    expect(readAabR8Metadata(fixture.aabPath)).toEqual({ compilerVersion: '9.4.1' });
    const result = inspectArtifacts(expected, ['android']);
    expect(result.matched).toHaveLength(1);
    expect(result.stale).toEqual([]);
  });

  it.each([
    ['missing mapping', null],
    ['empty mapping', ''],
    ['different compiler', R8_MAPPING.replace('compiler: R8', 'compiler: D8')],
    ['missing compiler version', R8_MAPPING.replace('# compiler_version: 9.4.1\n', '')],
    ['headers without class mappings', '# compiler: R8\n# compiler_version: 9.4.1\n'],
  ])('refuses a version-matching bundle with %s', (_name, mapping) => {
    writeBundle(mapping);
    expect(() => readAabR8Metadata(fixture.aabPath)).toThrow();
    const result = inspectArtifacts(expected, ['android']);
    expect(result.matched).toEqual([]);
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].problems[0]).toContain('R8 mapping:');
  });

  it('reports both a stale version and missing R8 mapping', () => {
    writeBundle(null);
    const result = inspectArtifacts({ version: '1.7.0', versionCode: 9 }, ['android']);
    expect(result.matched).toEqual([]);
    expect(result.stale[0].problems).toEqual([
      'versionName is 1.6.0, expected 1.7.0',
      'versionCode is 8, expected 9',
      expect.stringContaining('R8 mapping:'),
    ]);
  });
});
