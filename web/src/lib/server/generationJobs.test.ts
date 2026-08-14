// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  setJSON: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@netlify/blobs', () => ({ getStore: () => store }));

import {
  issueWorkTicket,
  markJobPending,
  purgeExpiredGenerationJobs,
  verifyWorkTicket,
} from './generationJobs';
import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';

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

// A site-wide Netlify Blobs store expires nothing on its own, so `expiresAt`
// only ever changed what readJob answered. Everything a job leaves behind — the
// child's drawing and the picture made from it — survives until something
// deletes it, and collection is the only thing that did.
describe('purgeExpiredGenerationJobs', () => {
  const OTHER = 'b'.repeat(64);

  const pageOf = (...jobIds: string[]) => [
    {
      blobs: jobIds.flatMap((id) => [
        { key: `${id}/status.json` },
        { key: `${id}/input` },
        { key: `${id}/image` },
      ]),
    },
  ];

  beforeEach(() => {
    store.get.mockReset();
    store.setJSON.mockReset().mockResolvedValue({ modified: true });
    store.delete.mockReset().mockResolvedValue(undefined);
    store.list.mockReset().mockReturnValue(pageOf(JOB));
  });

  it('deletes every key of a job nobody ever collected', async () => {
    // The whole finding: a child closes the modal, or the app is killed, and the
    // finished picture sits there because no poll ever ran the collection path.
    store.get.mockResolvedValue({ context: {}, outcome: null, expiresAt: 1_000 });

    const result = await purgeExpiredGenerationJobs(2_000);

    expect(store.delete.mock.calls.map(([key]) => key)).toEqual([
      `${JOB}/input`,
      `${JOB}/image`,
      `${JOB}/status.json`,
    ]);
    expect(result).toEqual({ purgedJobs: 1, deletedBlobs: 3 });
  });

  it('leaves a job that is still within its lifetime alone', async () => {
    const now = 10_000;
    store.get.mockResolvedValue({
      context: {},
      outcome: null,
      expiresAt: now + GENERATION_JOB_TTL_MS,
    });

    expect(await purgeExpiredGenerationJobs(now)).toEqual({ purgedJobs: 0, deletedBlobs: 0 });
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('sweeps bytes whose status record is already gone', async () => {
    // markJobPending writes the status before putJobInput writes the drawing, so
    // bytes without a record are never a job mid-start — they are the remains of
    // one whose record has been deleted, and nothing else will come for them.
    store.list.mockReturnValue([{ blobs: [{ key: `${JOB}/input` }] }]);
    store.get.mockResolvedValue(null);

    expect(await purgeExpiredGenerationJobs(2_000)).toMatchObject({ purgedJobs: 1 });
    expect(store.delete).toHaveBeenCalledWith(`${JOB}/input`);
  });

  it('purges each expired job without touching a live one beside it', async () => {
    store.list.mockReturnValue(pageOf(JOB, OTHER));
    store.get.mockImplementation((key: string) =>
      Promise.resolve({
        context: {},
        outcome: null,
        expiresAt: key.startsWith(JOB) ? 1_000 : 999_000,
      })
    );

    expect(await purgeExpiredGenerationJobs(2_000)).toEqual({ purgedJobs: 1, deletedBlobs: 3 });
    expect(store.delete.mock.calls.every(([key]) => key.startsWith(JOB))).toBe(true);
  });

  it('marks a job pending with a lifetime the sweep can act on', async () => {
    // The two halves have to agree: a record written with no expiry, or one the
    // purge reads under a different name, is a job that never ages out.
    await markJobPending(JOB, { free: null, style: null }, 5_000);

    expect(store.setJSON).toHaveBeenCalledWith(`${JOB}/status.json`, {
      context: { free: null, style: null },
      outcome: null,
      expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
    });
  });
});
