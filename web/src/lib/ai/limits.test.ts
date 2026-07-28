// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CLIENT_REQUEST_TIMEOUT_MS,
  GENERATE_DEADLINE_MS,
  NETLIFY_SYNC_TIMEOUT_MS,
  VERIFY_KEY_DEADLINE_MS,
} from './limits';

describe('AI deadline ladder (ADR-0063)', () => {
  it('aborts on the server before the platform, and on the client after it', () => {
    expect(GENERATE_DEADLINE_MS).toBeLessThan(NETLIFY_SYNC_TIMEOUT_MS);
    expect(NETLIFY_SYNC_TIMEOUT_MS).toBeLessThan(CLIENT_REQUEST_TIMEOUT_MS);
  });

  it('keeps the key probe well under the generation deadline', () => {
    expect(VERIFY_KEY_DEADLINE_MS).toBeLessThan(GENERATE_DEADLINE_MS);
  });
});
