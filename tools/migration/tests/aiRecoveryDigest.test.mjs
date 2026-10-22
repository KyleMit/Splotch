import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { recoveryDigest } from '../../../src/ai/recoveryDigest.ts';
import { recoveryRequestId } from '../../../src/ai/recoveryRequest.ts';

it.each([0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 65537])(
  'hashes copied native bytes at the SHA256 padding boundary %i',
  (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => index % 251);
    expect(recoveryDigest(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
  }
);
it.each([
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
])('matches the independent standard SHA256 vector %s', (text, digest) => {
  expect(recoveryDigest(new TextEncoder().encode(text))).toBe(digest);
});
it('derives the request id from protocol, one nonce and the original creation time', async () => {
  const nonce = 'a'.repeat(64),
    createdAt = 2000;
  const expected = createHash('sha256')
    .update(JSON.stringify(['splotch-ai-recovery-v1', nonce, createdAt]))
    .digest('hex');
  expect(await recoveryRequestId(nonce, createdAt)).toBe(expected);
  expect(await recoveryRequestId(nonce, createdAt + 1)).not.toBe(expected);
});
