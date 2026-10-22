import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync(
  new URL('../../../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8'
);

const mediaLibraryManifest = readFileSync(
  join(
    dirname(createRequire(import.meta.url).resolve('expo-media-library/package.json')),
    'android/src/main/AndroidManifest.xml'
  ),
  'utf8'
);

function permissions(source) {
  return [...source.matchAll(/<uses-permission\b([^>]*)\/>/g)].map(([, attributes]) => ({
    name: attributes.match(/android:name="([^"]+)"/)?.[1],
    removed: /tools:node="remove"/.test(attributes),
    limited: /maxSdkVersion/.test(attributes),
  }));
}

describe('Android manifest permissions', () => {
  it('requests network access and legacy writes while removing media read grants', () => {
    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"');
    expect(permissions(manifest)).toEqual([
      { name: 'android.permission.INTERNET', removed: false, limited: false },
      { name: 'android.permission.ACCESS_NETWORK_STATE', removed: false, limited: false },
      { name: 'android.permission.READ_EXTERNAL_STORAGE', removed: true, limited: false },
      { name: 'android.permission.WRITE_EXTERNAL_STORAGE', removed: false, limited: true },
      { name: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED', removed: true, limited: false },
    ]);
  });

  it('limits the legacy write grant to API 28 and removes every other media permission', () => {
    const declared = permissions(mediaLibraryManifest).map(({ name }) => name);
    expect(declared).toContain('android.permission.READ_EXTERNAL_STORAGE');
    const removed = permissions(manifest)
      .filter((permission) => permission.removed)
      .map(({ name }) => name);
    expect(removed).toEqual(
      expect.arrayContaining(
        declared.filter((name) => name !== 'android.permission.WRITE_EXTERNAL_STORAGE')
      )
    );
    const writeVersion = (source) =>
      source.match(
        /<uses-permission\b[^>]*android:name="android.permission.WRITE_EXTERNAL_STORAGE"[^>]*android:maxSdkVersion="(\d+)"[^>]*\/>/
      )?.[1];
    expect(writeVersion(manifest)).toBe('28');
  });

  it('allows no cleartext traffic or package visibility queries', () => {
    expect(manifest).not.toMatch(/usesCleartextTraffic="true"|<queries\b/);
  });

  it('detects a storage permission that is merged instead of removed', () => {
    const merged = manifest.replace(
      'READ_EXTERNAL_STORAGE" tools:node="remove"',
      'READ_EXTERNAL_STORAGE" tools:node="merge"'
    );
    expect(permissions(merged)).toContainEqual({
      name: 'android.permission.READ_EXTERNAL_STORAGE',
      removed: false,
      limited: false,
    });
  });
});
