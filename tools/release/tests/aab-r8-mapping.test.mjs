import { afterAll, describe, expect, it, vi } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { zip } from './fixtures/zip-writer.mjs';
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
const validMapping = '# compiler: R8\n# compiler_version: 9.4.1\nexample.Plugin -> a.b:\n';

function writeBundle(mapping) {
  const attribute = (name, value) =>
    Buffer.concat([
      Buffer.from([0x12, name.length]),
      Buffer.from(name),
      Buffer.from([0x1a, value.length]),
      Buffer.from(value),
    ]);
  const entries = [
    {
      name: 'base/manifest/AndroidManifest.xml',
      data: Buffer.concat([attribute('versionName', '1.6.0'), attribute('versionCode', '8')]),
    },
  ];
  if (mapping !== undefined) {
    entries.push({
      name: 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map',
      data: Buffer.from(mapping),
    });
  }
  writeFileSync(fixture.aabPath, zip(entries));
}

describe('Android release mapping verification', () => {
  it('accepts a version-matching bundle with embedded R8 class mappings', () => {
    writeBundle(validMapping);
    expect(readAabR8Metadata(fixture.aabPath)).toEqual({ compilerVersion: '9.4.1' });
    const result = inspectArtifacts(expected, ['android']);
    expect(result.matched).toHaveLength(1);
    expect(result.stale).toEqual([]);
  });

  it.each([
    ['missing mapping', undefined],
    ['empty mapping', ''],
    ['different compiler', validMapping.replace('compiler: R8', 'compiler: D8')],
    ['missing compiler version', validMapping.replace('# compiler_version: 9.4.1\n', '')],
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
    writeBundle(undefined);
    const result = inspectArtifacts({ version: '1.7.0', versionCode: 9 }, ['android']);
    expect(result.matched).toEqual([]);
    expect(result.stale[0].problems).toEqual([
      'versionName is 1.6.0, expected 1.7.0',
      'versionCode is 8, expected 9',
      expect.stringContaining('R8 mapping:'),
    ]);
  });
});
