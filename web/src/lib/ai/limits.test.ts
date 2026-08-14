// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CLIENT_REQUEST_TIMEOUT_MS,
  GENERATION_JOB_TTL_MS,
  GENERATION_POLL_TIMEOUT_MS,
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

  it('keeps a job collectible for longer than the client will wait for it', () => {
    // The async half of the ladder (ADR-0115). A job that expires while the
    // client is still polling turns a finished picture into a 404, and — because
    // the free-generation lease is this same constant — reclaims the slot while
    // the picture is still on its way, so the success is booked as an abandoned
    // failure and the child's counter never moves.
    expect(GENERATION_POLL_TIMEOUT_MS).toBeLessThan(GENERATION_JOB_TTL_MS);
  });
});
