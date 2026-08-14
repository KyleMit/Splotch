import { describe, expect, it } from 'vitest';
import { issueWorkTicket, verifyWorkTicket } from './generationJobs';

// The worker is a publicly reachable function URL, so the ticket is the whole
// reason "only we call it" is true rather than assumed. These cover the ways it
// could be true-looking and wrong.

const SECRET = 'test-secret';
const JOB = 'a'.repeat(64);
const PAYLOAD = JSON.stringify({ jobId: JOB, prompt: 'draw a cat' });

describe('work tickets', () => {
  it('accepts the job and payload it was issued for', () => {
    const ticket = issueWorkTicket(JOB, PAYLOAD, SECRET);
    expect(verifyWorkTicket(ticket, JOB, PAYLOAD, SECRET)).toBe(true);
  });

  it('cannot be replayed onto a different job', () => {
    const ticket = issueWorkTicket(JOB, PAYLOAD, SECRET);
    expect(verifyWorkTicket(ticket, 'b'.repeat(64), PAYLOAD, SECRET)).toBe(false);
  });

  it('cannot be replayed onto different work', () => {
    // The point of signing the payload and not just the id: otherwise one
    // observed ticket would authorize any generation at all.
    const ticket = issueWorkTicket(JOB, PAYLOAD, SECRET);
    const tampered = JSON.stringify({ jobId: JOB, prompt: 'draw something else' });
    expect(verifyWorkTicket(ticket, JOB, tampered, SECRET)).toBe(false);
  });

  it('expires', () => {
    const issuedAt = 1_000_000;
    const ticket = issueWorkTicket(JOB, PAYLOAD, SECRET, issuedAt);
    expect(verifyWorkTicket(ticket, JOB, PAYLOAD, SECRET, issuedAt + 1_000)).toBe(true);
    expect(verifyWorkTicket(ticket, JOB, PAYLOAD, SECRET, issuedAt + 10 * 60_000)).toBe(false);
  });

  it('does not verify against a different secret', () => {
    const ticket = issueWorkTicket(JOB, PAYLOAD, SECRET);
    expect(verifyWorkTicket(ticket, JOB, PAYLOAD, 'other-secret')).toBe(false);
  });

  it('issues nothing and verifies nothing when the secret is unconfigured', () => {
    // Fail closed: with no secret the start endpoint gets null and falls back to
    // answering in-line, rather than dispatching work no worker will accept.
    expect(issueWorkTicket(JOB, PAYLOAD, undefined)).toBeNull();
    expect(verifyWorkTicket('anything', JOB, PAYLOAD, undefined)).toBe(false);
  });

  it('rejects a malformed or missing ticket instead of throwing', () => {
    for (const ticket of [null, '', 'nonsense', '123', '.', `${Date.now() + 1000}.`]) {
      expect(verifyWorkTicket(ticket, JOB, PAYLOAD, SECRET)).toBe(false);
    }
  });
});
