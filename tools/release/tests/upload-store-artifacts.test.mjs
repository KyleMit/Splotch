import { describe, expect, it } from 'vitest';
import { missingCredentials, parseUploadArgs } from '../upload-store-artifacts.mjs';

describe('parseUploadArgs', () => {
  it('requires a platform and takes --dry-run', () => {
    expect(parseUploadArgs(['--only=android'])).toEqual({ platform: 'android', dryRun: false });
    expect(parseUploadArgs(['--only=ios', '--dry-run'])).toEqual({ platform: 'ios', dryRun: true });
  });

  // An upload with no platform would push to both stores at once; refuse it.
  it('refuses a missing or unknown platform', () => {
    expect(() => parseUploadArgs([])).toThrow(/--only=android\|ios/);
    expect(() => parseUploadArgs(['--only=web'])).toThrow(/--only=android\|ios/);
  });
});

describe('missingCredentials', () => {
  it('names every unset credential for the platform', () => {
    expect(missingCredentials('android', {})).toEqual(['SPLOTCH_PLAY_JSON_KEY']);
    expect(missingCredentials('ios', { SPLOTCH_ASC_KEY_ID: 'K' })).toEqual([
      'SPLOTCH_ASC_ISSUER_ID',
      'SPLOTCH_ASC_KEY_PATH',
    ]);
    expect(missingCredentials('android', { SPLOTCH_PLAY_JSON_KEY: '/keys/play.json' })).toEqual([]);
  });
});
