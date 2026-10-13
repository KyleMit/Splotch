import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync(
  new URL(
    '../../../experiments/native-architecture/android/app/src/main/AndroidManifest.xml',
    import.meta.url
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
  it('requests only network access and removes the legacy external storage grants', () => {
    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"');
    expect(permissions(manifest)).toEqual([
      { name: 'android.permission.INTERNET', removed: false, limited: false },
      { name: 'android.permission.ACCESS_NETWORK_STATE', removed: false, limited: false },
      { name: 'android.permission.READ_EXTERNAL_STORAGE', removed: true, limited: false },
      { name: 'android.permission.WRITE_EXTERNAL_STORAGE', removed: true, limited: false },
    ]);
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
