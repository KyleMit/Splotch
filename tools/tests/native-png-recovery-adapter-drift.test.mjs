import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const ADAPTERS = [
  ['drawingFiles.ts', '133942d3720f1f7b80cff95232282e87ba021d4c'],
  ['drawingFiles.web.ts', '4ca6d1f82eaa6c9c024e6349ed3dfed415536f67'],
];

function blobHash(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

it.each(ADAPTERS)('preserves the exhausted N1 %s adapter byte-exact', (name, inheritedBlob) => {
  const bytes = readFileSync(
    new URL(`../../experiments/native-architecture/src/platform/${name}`, import.meta.url)
  );
  expect(blobHash(bytes)).toBe(inheritedBlob);
});

it.each(ADAPTERS)(
  'rejects a changed in-memory copy of inherited %s without editing the adapter',
  (name, inheritedBlob) => {
    const bytes = readFileSync(
      new URL(`../../experiments/native-architecture/src/platform/${name}`, import.meta.url)
    );
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    expect(blobHash(changed)).not.toBe(inheritedBlob);
  }
);
