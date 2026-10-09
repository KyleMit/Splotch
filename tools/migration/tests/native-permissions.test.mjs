import { describe, expect, it } from 'vitest';
import { assertFixture, fixture, replace } from './native-source-fixtures.mjs';

describe('native manifest permission contract', () => {
  it.each(
    ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'].flatMap((permission) =>
      ['absent', 'duplicate', 'merge', 'sdk-grant'].map((mutation) => [permission, mutation])
    )
  )('requires the exact %s removal after %s mutation', (permission, mutation) => {
    const path = 'android/app/src/main/AndroidManifest.xml';
    const marker = `<uses-permission android:name="android.permission.${permission}" tools:node="remove"/>`;
    const replacements = {
      absent: '',
      duplicate: marker + marker,
      merge: marker.replace('tools:node="remove"', 'tools:node="merge"'),
      'sdk-grant': marker.replace('tools:node="remove"', 'android:maxSdkVersion="32"'),
    };
    const value = fixture();
    replace(value, path, marker, replacements[mutation]);
    expect(() => assertFixture(value)).toThrow('storage permission removal');
  });

  it.each(['', 'xmlns:tools="https://foreign.invalid/tools"'])(
    'rejects a changed Android tools namespace %s',
    (replacement) => {
      const value = fixture();
      replace(
        value,
        'android/app/src/main/AndroidManifest.xml',
        'xmlns:tools="http://schemas.android.com/tools"',
        replacement
      );
      expect(() => assertFixture(value)).toThrow('Android manifest tools namespace');
    }
  );

  it('rejects extra removal markers and an INTERNET removal', () => {
    const extra = fixture();
    replace(
      extra,
      'android/app/src/main/AndroidManifest.xml',
      '<application',
      '<uses-permission android:name="android.permission.CAMERA" tools:node="remove"/><application'
    );
    expect(() => assertFixture(extra)).toThrow('Unreviewed Android permission');
    const network = fixture();
    replace(
      network,
      'android/app/src/main/AndroidManifest.xml',
      '<uses-permission android:name="android.permission.INTERNET"/>',
      '<uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>'
    );
    expect(() => assertFixture(network)).toThrow('network permission');
  });
});
