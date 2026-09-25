// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  get: vi.fn(),
  getWithMetadata: vi.fn(),
  set: vi.fn(),
  setJSON: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@netlify/blobs', () => ({ getStore: () => store }));

import {
  claimJob,
  completeJob,
  issueWorkTicket,
  markJobPending,
  purgeExpiredGenerationJobs,
  readJob,
  verifyWorkTicket,
} from './generationJobs';
import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';

// The worker is a publicly reachable function URL, so the ticket is the whole
// reason "only we call it" is true rather than assumed. These cover the ways it
// could be true-looking and wrong.

const SECRET = 'test-secret';
const JOB = 'a'.repeat(64);
const PAYLOAD = JSON.stringify({ jobId: JOB, prompt: 'draw a cat' });

const storedJob = (overrides: Record<string, unknown> = {}) => ({
  context: { free: null, style: null },
  outcome: null,
  claimId: null,
  expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
  ...overrides,
});

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
      blobs: [],
      directories: jobIds,
    },
  ];

  beforeEach(() => {
    store.get.mockReset();
    store.getWithMetadata.mockReset();
    store.set.mockReset().mockResolvedValue({ modified: true });
    store.setJSON.mockReset().mockResolvedValue({ modified: true });
    store.delete.mockReset().mockResolvedValue(undefined);
    store.list.mockReset().mockReturnValue(pageOf(JOB));
  });

  it('deletes every key of a job nobody ever collected', async () => {
    // The whole finding: a child closes the modal, or the app is killed, and the
    // finished picture sits there because no poll ever ran the collection path.
    store.get.mockResolvedValue(storedJob({ expiresAt: 1_000 }));

    const result = await purgeExpiredGenerationJobs(2_000);

    expect(store.delete.mock.calls.map(([key]) => key)).toEqual([
      `${JOB}/input`,
      `${JOB}/image`,
      `${JOB}/status.json`,
    ]);
    expect(result).toEqual({
      attemptedJobs: 1,
      purgedJobs: 1,
      failedJobs: 0,
      retainedJobs: 0,
      deletedBlobs: 3,
      failedBlobDeletes: 0,
    });
  });

  it('leaves a job that is still within its lifetime alone', async () => {
    const now = 10_000;
    store.get.mockResolvedValue(storedJob({ expiresAt: now + GENERATION_JOB_TTL_MS }));

    expect(await purgeExpiredGenerationJobs(now)).toEqual({
      attemptedJobs: 1,
      purgedJobs: 0,
      failedJobs: 0,
      retainedJobs: 1,
      deletedBlobs: 0,
      failedBlobDeletes: 0,
    });
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('sweeps bytes whose status record is already gone', async () => {
    // markJobPending writes the status before putJobInput writes the drawing, so
    // bytes without a record are never a job mid-start — they are the remains of
    // one whose record has been deleted, and nothing else will come for them.
    store.list.mockReturnValue([{ blobs: [], directories: [JOB] }]);
    store.get.mockResolvedValue(null);

    expect(await purgeExpiredGenerationJobs(2_000)).toMatchObject({ purgedJobs: 1 });
    expect(store.delete).toHaveBeenCalledWith(`${JOB}/input`);
  });

  it('purges each expired job without touching a live one beside it', async () => {
    store.list.mockReturnValue(pageOf(JOB, OTHER));
    store.get.mockImplementation((key: string) =>
      Promise.resolve({
        context: { free: null, style: null },
        outcome: null,
        claimId: null,
        expiresAt: key.startsWith(JOB) ? 1_000 : 999_000,
      })
    );

    expect(await purgeExpiredGenerationJobs(2_000)).toEqual({
      attemptedJobs: 2,
      purgedJobs: 1,
      failedJobs: 0,
      retainedJobs: 1,
      deletedBlobs: 3,
      failedBlobDeletes: 0,
    });
    expect(store.delete.mock.calls.every(([key]) => key.startsWith(JOB))).toBe(true);
  });

  it('processes directory pages after isolated job failures without repeating split jobs', async () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readFailure = 'c'.repeat(64);
    const laterExpired = 'd'.repeat(64);
    const laterRetained = 'e'.repeat(64);
    const keyPages = [
      [`${JOB}/status.json`, `${readFailure}/status.json`],
      [`${JOB}/input`, `${laterExpired}/status.json`, `${laterRetained}/status.json`],
    ];
    store.list.mockImplementation((options) => {
      expect(options).toEqual({ paginate: true, directories: true });
      return (async function* () {
        for (const keys of keyPages) {
          const directories = keys.map((key) => key.slice(0, key.indexOf('/')));
          yield { blobs: [], directories };
        }
      })();
    });
    store.get.mockImplementation((key: string) => {
      if (key.startsWith(readFailure)) return Promise.reject(new Error('read failed'));
      return Promise.resolve({
        context: { free: null, style: null },
        outcome: null,
        claimId: null,
        expiresAt: key.startsWith(laterRetained) ? 999_000 : 1_000,
      });
    });
    store.delete.mockImplementation((key: string) => {
      if (key === `${JOB}/image`) return Promise.reject(new Error('delete failed'));
      return Promise.resolve();
    });

    await expect(purgeExpiredGenerationJobs(2_000)).resolves.toEqual({
      attemptedJobs: 4,
      purgedJobs: 1,
      failedJobs: 2,
      retainedJobs: 1,
      deletedBlobs: 5,
      failedBlobDeletes: 1,
    });
    expect(store.get.mock.calls.filter(([key]) => key === `${JOB}/status.json`)).toHaveLength(1);
    expect(store.delete).toHaveBeenCalledWith(`${laterExpired}/status.json`);
    expect(store.delete.mock.calls.some(([key]) => key.startsWith(laterRetained))).toBe(false);
    expect(warnMock).toHaveBeenCalledWith(
      '[purge-generation-jobs] failed to process a job:',
      'read failed'
    );
    expect(warnMock).toHaveBeenCalledWith(
      '[purge-generation-jobs] failed to delete a job blob:',
      'delete failed'
    );
  });

  it('marks a job pending with a lifetime the sweep can act on', async () => {
    // The two halves have to agree: a record written with no expiry, or one the
    // purge reads under a different name, is a job that never ages out.
    await markJobPending(JOB, { free: null, style: null }, 5_000);

    expect(store.setJSON).toHaveBeenCalledWith(`${JOB}/status.json`, {
      context: { free: null, style: null },
      outcome: null,
      claimId: null,
      expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
    });
  });

  it('lets only one worker claim a pending job', async () => {
    const pending = {
      context: { free: null, style: null },
      outcome: null,
      claimId: null,
      expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
    };
    store.getWithMetadata.mockResolvedValue({ data: pending, etag: 'pending-v1', metadata: {} });
    store.setJSON
      .mockResolvedValueOnce({ modified: true })
      .mockResolvedValueOnce({ modified: false });

    const winner = await claimJob(JOB);
    const loser = await claimJob(JOB);

    expect(winner).toEqual(expect.any(String));
    expect(loser).toBeNull();
    expect(store.setJSON).toHaveBeenNthCalledWith(
      1,
      `${JOB}/status.json`,
      { ...pending, claimId: winner },
      { onlyIfMatch: 'pending-v1' }
    );
  });

  it('recovers a claim whose successful write loses its reply', async () => {
    const pending = {
      context: { free: null, style: null },
      outcome: null,
      claimId: null,
      expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
    };
    let written: unknown;
    store.getWithMetadata.mockResolvedValueOnce({
      data: pending,
      etag: 'pending-v1',
      metadata: {},
    });
    store.setJSON.mockImplementationOnce(async (_key, value) => {
      written = value;
      throw new Error('reply lost');
    });
    store.get.mockImplementationOnce(async () => written);

    const claim = await claimJob(JOB);

    expect(claim).toEqual(expect.any(String));
    expect(written).toEqual({ ...pending, claimId: claim });
  });

  it('keeps the lifetime the start gave a job when the worker records its outcome', async () => {
    const context = { free: { installationId: 'c'.repeat(64), reservationId: 'r1' }, style: null };
    const claimId = 'claim-1';
    store.getWithMetadata.mockResolvedValueOnce({
      data: { context, outcome: null, claimId, expiresAt: 5_000 + GENERATION_JOB_TTL_MS },
      etag: 'pending-v1',
      metadata: {},
    });

    await completeJob(JOB, claimId, { status: 'refusal', reason: 'IMAGE_SAFETY' }, null);

    expect(store.setJSON).toHaveBeenCalledWith(
      `${JOB}/status.json`,
      {
        context,
        outcome: { status: 'refusal', reason: 'IMAGE_SAFETY' },
        claimId,
        expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
      },
      { onlyIfMatch: 'pending-v1' }
    );
  });

  it('does not recreate an outcome whose pending start record is gone', async () => {
    store.getWithMetadata.mockResolvedValueOnce(null);

    await completeJob(JOB, 'claim-1', { status: 'error', reason: 'late' }, null);

    expect(store.setJSON).not.toHaveBeenCalled();
  });

  it('does not replace a job that already has an outcome', async () => {
    store.getWithMetadata.mockResolvedValueOnce({
      data: {
        context: { free: null, style: null },
        outcome: { status: 'image', mimeType: 'image/png' },
        claimId: 'claim-1',
        expiresAt: 5_000 + GENERATION_JOB_TTL_MS,
      },
      etag: 'complete-v1',
      metadata: {},
    });

    await completeJob(JOB, 'claim-1', { status: 'error', reason: 'duplicate' }, null);

    expect(store.setJSON).not.toHaveBeenCalled();
  });
});

// `@netlify/blobs` types a JSON read as `any`, so a record written by an older
// deploy or cut short mid-write reaches this module unchecked. Each case pairs a
// malformed record with a well-formed one so the test proves the guard, not a
// call site that ignores the store entirely.
describe('malformed job records', () => {
  // Each builder takes the claim id the call site expects, so completeJob's
  // claim match cannot be what rejects the record.
  const MALFORMED = [
    [
      'a missing context',
      (claimId: string | null) => ({ ...storedJob({ claimId }), context: undefined }),
    ],
    ['a non-numeric expiry', (claimId: string | null) => storedJob({ claimId, expiresAt: '9999' })],
    [
      'an outcome of an unknown shape',
      (claimId: string | null) => storedJob({ claimId, outcome: { status: 'image' } }),
    ],
    [
      'a free reservation without its id',
      (claimId: string | null) => storedJob({ claimId, context: { free: {}, style: null } }),
    ],
    ['a bare string', () => 'status'],
  ] as const;

  let warnMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store.get.mockReset();
    store.getWithMetadata.mockReset();
    store.set.mockReset().mockResolvedValue({ modified: true });
    store.setJSON.mockReset().mockResolvedValue({ modified: true });
    store.delete.mockReset().mockResolvedValue(undefined);
    store.list.mockReset().mockReturnValue([{ blobs: [], directories: [JOB] }]);
    warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnMock.mockClear();
  });

  describe('readJob', () => {
    it('reports a well-formed pending record as pending', async () => {
      store.get.mockResolvedValue(storedJob());

      expect(await readJob(JOB, 5_000)).toEqual({
        status: 'pending',
        context: { free: null, style: null },
      });
      expect(warnMock).not.toHaveBeenCalled();
    });

    it.each(MALFORMED)(
      'reports %s as expired, since the picture is not coming',
      async (_, record) => {
        store.get.mockResolvedValue(record(null));

        expect(await readJob(JOB, 5_000)).toEqual({ status: 'expired' });
        expect(warnMock).toHaveBeenCalledWith('[generation-jobs] ignoring a malformed job record');
      }
    );
  });

  describe('claimJob', () => {
    it('claims a well-formed pending record', async () => {
      store.getWithMetadata.mockResolvedValue({ data: storedJob(), etag: 'v1', metadata: {} });

      expect(await claimJob(JOB)).toEqual(expect.any(String));
      expect(store.setJSON).toHaveBeenCalledTimes(1);
    });

    it.each(MALFORMED)('does not claim %s', async (_, record) => {
      store.getWithMetadata.mockResolvedValue({ data: record(null), etag: 'v1', metadata: {} });

      expect(await claimJob(JOB)).toBeNull();
      expect(store.setJSON).not.toHaveBeenCalled();
    });

    it('does not claim a record without an etag to make the write conditional on', async () => {
      store.getWithMetadata.mockResolvedValue({ data: storedJob(), metadata: {} });

      expect(await claimJob(JOB)).toBeNull();
      expect(store.setJSON).not.toHaveBeenCalled();
    });

    it('recovers a lost-reply claim from a well-formed record', async () => {
      let written: unknown;
      store.getWithMetadata.mockResolvedValue({ data: storedJob(), etag: 'v1', metadata: {} });
      store.setJSON.mockImplementationOnce(async (_key, value) => {
        written = value;
        throw new Error('reply lost');
      });
      store.get.mockImplementationOnce(async () => written);

      expect(await claimJob(JOB)).toEqual(expect.any(String));
    });

    it.each(MALFORMED)('does not recover a lost-reply claim from %s', async (_, record) => {
      let claimId: string | null = null;
      store.getWithMetadata.mockResolvedValue({ data: storedJob(), etag: 'v1', metadata: {} });
      store.setJSON.mockImplementationOnce(async (_key, value: { claimId: string }) => {
        claimId = value.claimId;
        throw new Error('reply lost');
      });
      // The malformed record carries the attempt's own claim id, so only the
      // guard can be what refuses the recovery.
      store.get.mockImplementationOnce(async () => record(claimId));

      await expect(claimJob(JOB)).rejects.toThrow('reply lost');
    });
  });

  describe('completeJob', () => {
    const CLAIM = 'claim-1';
    const OUTCOME = { status: 'error', reason: 'late' } as const;

    it('records the outcome on a well-formed claimed record', async () => {
      store.getWithMetadata.mockResolvedValue({
        data: storedJob({ claimId: CLAIM }),
        etag: 'v1',
        metadata: {},
      });

      await completeJob(JOB, CLAIM, OUTCOME, new ArrayBuffer(1));

      expect(store.set).toHaveBeenCalledTimes(1);
      expect(store.setJSON).toHaveBeenCalledTimes(1);
    });

    it.each(MALFORMED)('writes nothing over %s', async (_, record) => {
      store.getWithMetadata.mockResolvedValue({ data: record(CLAIM), etag: 'v1', metadata: {} });

      await completeJob(JOB, CLAIM, OUTCOME, new ArrayBuffer(1));

      expect(store.set).not.toHaveBeenCalled();
      expect(store.setJSON).not.toHaveBeenCalled();
    });
  });

  describe('purgeExpiredGenerationJobs', () => {
    it('retains a well-formed record that has not expired', async () => {
      store.get.mockResolvedValue(storedJob());

      expect(await purgeExpiredGenerationJobs(5_000)).toMatchObject({
        retainedJobs: 1,
        purgedJobs: 0,
      });
      expect(store.delete).not.toHaveBeenCalled();
    });

    it.each(MALFORMED)('treats %s as eligible for deletion', async (_, record) => {
      store.get.mockResolvedValue(record(null));

      expect(await purgeExpiredGenerationJobs(5_000)).toMatchObject({
        retainedJobs: 0,
        purgedJobs: 1,
      });
      expect(store.delete).toHaveBeenCalledWith(`${JOB}/status.json`);
    });
  });
});
