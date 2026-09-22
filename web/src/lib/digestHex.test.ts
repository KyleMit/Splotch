// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './digestHex';

const EMPTY_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_DIGEST = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
// The digest of this input starts with the byte 0x09, so an unpadded conversion loses its leading
// zero and yields 63 characters that still look like a digest.
const LEADING_ZERO_BYTE_INPUT = 'splotch-12';
const LEADING_ZERO_BYTE_DIGEST = '09c8206f19dd945a1cfd1d96a389a3e14a65b3149d3b21e1c766ce42bc6a53c6';
const HEX_DIGEST_LENGTH = 64;

function utf8(text: string) {
  return new TextEncoder().encode(text);
}

describe('sha256Hex', () => {
  it('matches the known digest of the empty input', async () => {
    await expect(sha256Hex(new Uint8Array())).resolves.toBe(EMPTY_DIGEST);
  });

  it('matches the known digest of a short ASCII input', async () => {
    await expect(sha256Hex(utf8('abc'))).resolves.toBe(ABC_DIGEST);
  });

  it('keeps the leading zero of a digest whose first byte is below 0x10', async () => {
    const hex = await sha256Hex(utf8(LEADING_ZERO_BYTE_INPUT));
    expect(hex).toBe(LEADING_ZERO_BYTE_DIGEST);
    expect(hex).toHaveLength(HEX_DIGEST_LENGTH);
  });

  it('emits 64 lowercase hex characters for every input', async () => {
    for (const input of ['', 'abc', LEADING_ZERO_BYTE_INPUT, 'a'.repeat(1000)]) {
      const hex = await sha256Hex(utf8(input));
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('agrees with node:crypto over a spread of inputs', async () => {
    for (let i = 0; i < 64; i += 1) {
      const bytes = utf8(`splotch-${i}`);
      await expect(sha256Hex(bytes)).resolves.toBe(
        createHash('sha256').update(bytes).digest('hex')
      );
    }
  });

  it('accepts an ArrayBuffer as well as a typed array', async () => {
    const bytes = utf8('abc');
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    await expect(sha256Hex(buffer)).resolves.toBe(ABC_DIGEST);
  });
});
