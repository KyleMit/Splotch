import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const RETAINED_N1_ADAPTERS = [
  ['drawingFiles.ts', 'e26217acd4be7e75757c27962182db4b49c04e64'],
  ['drawingFiles.web.ts', 'd73a9535019a4a8f7c3842de0df9413bfc0d7ec1'],
];

function blobHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

it.each(RETAINED_N1_ADAPTERS)(
  'pins retained N1 save/reopen %s bytes after obsolete PNG API retirement',
  (name, retainedBlob) => {
    const bytes = readFileSync(
      new URL(`../../experiments/native-architecture/src/platform/${name}`, import.meta.url)
    );
    expect(blobHash(bytes)).toBe(retainedBlob);
  }
);

it.each(RETAINED_N1_ADAPTERS)(
  'rejects changed retained N1 save/reopen %s bytes without editing the adapter',
  (name, retainedBlob) => {
    const bytes = readFileSync(
      new URL(`../../experiments/native-architecture/src/platform/${name}`, import.meta.url)
    );
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    expect(blobHash(changed)).not.toBe(retainedBlob);
  }
);
