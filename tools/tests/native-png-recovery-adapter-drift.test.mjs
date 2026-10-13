import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assertOfflineAdapterBytes } from '../migration/lib/offline-library-source-extension.mjs';

const RETAINED_N1_ADAPTERS = [
  ['drawingFiles.ts', 'e26217acd4be7e75757c27962182db4b49c04e64'],
  ['drawingFiles.web.ts', 'd73a9535019a4a8f7c3842de0df9413bfc0d7ec1'],
];

function blobHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

it.each(RETAINED_N1_ADAPTERS)(
  'replays the offline feature extension from exact retained N1 save/reopen %s bytes',
  (name, retainedBlob) => {
    const bytes = readFileSync(
      new URL(`../../experiments/native-architecture/src/platform/${name}`, import.meta.url)
    );
    expect(() =>
      assertOfflineAdapterBytes(`src/platform/${name}`, bytes, retainedBlob)
    ).not.toThrow();
  }
);

it.each(RETAINED_N1_ADAPTERS)(
  'rejects changed offline save/reopen %s bytes without editing the adapter',
  (name, retainedBlob) => {
    const bytes = readFileSync(
      new URL(`../../experiments/native-architecture/src/platform/${name}`, import.meta.url)
    );
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    expect(() => assertOfflineAdapterBytes(`src/platform/${name}`, changed, retainedBlob)).toThrow(
      'Offline adapter extension changed'
    );
    expect(blobHash(changed)).not.toBe(retainedBlob);
  }
);
