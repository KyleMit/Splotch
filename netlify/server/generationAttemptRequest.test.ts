// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  API_KEY_HEADER,
  ACCESS_TOKEN_HEADER,
  INSTALLATION_ID_HEADER,
} from '../../src/lib/apiHeaders';
import { RecoveryFault } from '../../src/lib/ai/generationAttempt';
import {
  recoveryCredential,
  recoveryStyleQuery,
  validateRecoveryInput,
} from './generationAttemptRequest';
import { RECOVERY_MAX_INPUT_PIXELS } from './generationAttemptPolicy';
const FIXTURE_PIXEL_SIZE = 2;
const TRUNCATED_HEADER_BYTES = 30;
const PNG_WIDTH_OFFSET_BYTES = 16;
async function png() {
  return sharp({
    create: {
      width: FIXTURE_PIXEL_SIZE,
      height: FIXTURE_PIXEL_SIZE,
      channels: 4,
      background: '#88aadd',
    },
  })
    .png()
    .toBuffer();
}
describe('recovery input trust boundary', () => {
  it('decodes a complete bounded PNG fixture', async () => {
    await expect(validateRecoveryInput(await png(), 'image/png')).resolves.toBeUndefined();
  });
  it('rejects a declared MIME that differs from the complete decoded fixture', async () => {
    await expect(validateRecoveryInput(await png(), 'image/jpeg')).rejects.toMatchObject({
      status: 400,
    });
  });
  it('rejects a corrupt header-only image before admission', async () => {
    const bytes = await png();
    await expect(
      validateRecoveryInput(bytes.subarray(0, TRUNCATED_HEADER_BYTES), 'image/png')
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects a valid header claiming an unqualified pixel count', async () => {
    const bytes = await png();
    bytes.writeUInt32BE(RECOVERY_MAX_INPUT_PIXELS + 1, PNG_WIDTH_OFFSET_BYTES);
    await expect(validateRecoveryInput(bytes, 'image/png')).rejects.toMatchObject({ status: 400 });
  });
  it.each<HeadersInit>([
    {},
    { [API_KEY_HEADER]: 'fixture-key', [ACCESS_TOKEN_HEADER]: 'fixture-code' },
    { [INSTALLATION_ID_HEADER]: 'not-an-installation' },
    { [API_KEY_HEADER]: 'fixture-key,another-key' },
    { [ACCESS_TOKEN_HEADER]: '' },
  ])('rejects malformed or ambiguous credential fixture %j', (headers) => {
    expect(() => recoveryCredential(new Headers(headers))).toThrow(RecoveryFault);
  });
  it('preserves exactly one original credential without provider verification', () => {
    expect(recoveryCredential(new Headers({ [API_KEY_HEADER]: 'fixture-key' }))).toEqual({
      kind: 'byok',
      identity: 'fixture-key',
    });
  });
  it('rejects duplicate style and secret-bearing query parameters', () => {
    expect(() =>
      recoveryStyleQuery(new URL('https://splotch.test?style=Magical&style=Magical'))
    ).toThrow(RecoveryFault);
    expect(() =>
      recoveryStyleQuery(new URL('https://splotch.test?style=Magical&apiKey=fixture'))
    ).toThrow(RecoveryFault);
  });
});
