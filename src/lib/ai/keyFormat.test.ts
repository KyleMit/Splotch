import { describe, expect, it } from 'vitest';
import { looksLikeApiKey } from './keyFormat';

describe('looksLikeApiKey', () => {
  // One prefix covers project, service-account, and legacy user keys.
  it.each(['sk-proj-ExampleKey1234', 'sk-svcacct-ExampleKey1234', 'sk-ExampleKey1234'])(
    'is true for %s',
    (key) => {
      expect(looksLikeApiKey(key)).toBe(true);
    }
  );

  it('is false for an access code', () => {
    expect(looksLikeApiKey('sunny-meadow')).toBe(false);
  });

  it('is false for a value that merely contains the key prefix later on', () => {
    expect(looksLikeApiKey('xsk-Key')).toBe(false);
  });

  it("is false for the retired provider's key shapes", () => {
    expect(looksLikeApiKey('AIzaSyExampleKey1234')).toBe(false);
    expect(looksLikeApiKey('AQ.Ab8ExampleKey1234')).toBe(false);
  });
});
