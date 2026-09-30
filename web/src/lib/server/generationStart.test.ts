// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { claimJob, discardJob, issueWorkTicket, markJobPending, putJobInput } = vi.hoisted(() => ({
  claimJob: vi.fn(),
  discardJob: vi.fn(),
  issueWorkTicket: vi.fn(),
  markJobPending: vi.fn(),
  putJobInput: vi.fn(),
}));

// Spread the real module rather than listing its exports: the ticket header is
// declared there precisely so neither side of the handoff restates it, and a
// factory that named it again would reintroduce the drift as a test fixture.
vi.mock('./generationJobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./generationJobs')>()),
  claimJob,
  discardJob,
  issueWorkTicket,
  markJobPending,
  putJobInput,
  newJobId: () => 'a'.repeat(64),
}));
vi.mock('./config', () => ({ config: { reportTokenSecret: () => 'test-secret' } }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { deadlineAfterFailedHandoffMs, startBackgroundGeneration } from './generationStart';
import { GENERATE_DEADLINE_MS } from '$lib/ai/limits';

const context = { free: null, style: null };
const image = { bytes: new ArrayBuffer(8), mimeType: 'image/png' };
const work = { apiKey: 'sk-test', prompt: 'draw a cat' };

const start = () => startBackgroundGeneration('https://splotch.art', context, image, work);

beforeEach(() => {
  claimJob.mockReset().mockResolvedValue('fallback-claim');
  discardJob.mockReset().mockResolvedValue(null);
  issueWorkTicket.mockReset().mockReturnValue('ticket');
  markJobPending.mockReset().mockResolvedValue(undefined);
  putJobInput.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
});

describe('startBackgroundGeneration', () => {
  it('hands the job off and reports when to poll', async () => {
    await expect(start()).resolves.toMatchObject({ jobId: 'a'.repeat(64) });
    expect(discardJob).not.toHaveBeenCalled();
  });

  it('deletes the drawing when the worker refuses the job', async () => {
    // The caller answers in-line from here, so no poll is coming and the
    // collection path — the only thing that deletes these blobs — never runs.
    // Without this the child's drawing stays at rest until a scheduled sweep.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(start()).resolves.toBeNull();
    expect(discardJob).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('deletes the drawing when the handoff throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));

    await expect(start()).resolves.toBeNull();
    expect(claimJob).toHaveBeenCalledWith('a'.repeat(64));
    expect(discardJob).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('keeps the job when a worker already claimed an ambiguously failed handoff', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    claimJob.mockResolvedValue(null);

    await expect(start()).resolves.toMatchObject({ jobId: 'a'.repeat(64) });
    expect(discardJob).not.toHaveBeenCalled();
  });

  it('keeps polling when the ownership check is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    claimJob.mockRejectedValue(new Error('store unreachable'));

    await expect(start()).resolves.toMatchObject({ jobId: 'a'.repeat(64) });
    expect(discardJob).not.toHaveBeenCalled();
  });

  // A job that was never sent has no worker, and its id never left this request:
  // a 202 would leave the child polling for a picture nobody is making, and a
  // free reservation handed to a job that nothing will ever settle.
  describe('when the job store fails before the worker is called', () => {
    it.each([
      [
        'the job record cannot be written and nothing is there to claim',
        () => {
          markJobPending.mockRejectedValue(new Error('store unreachable'));
          claimJob.mockResolvedValue(null);
        },
      ],
      [
        'the drawing cannot be stored and ownership cannot be read',
        () => {
          putJobInput.mockRejectedValue(new Error('store unreachable'));
          claimJob.mockRejectedValue(new Error('store unreachable'));
        },
      ],
    ])('answers in-line when %s', async (_label, failTheStore) => {
      failTheStore();

      await expect(start()).resolves.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(claimJob).not.toHaveBeenCalled();
      expect(discardJob).toHaveBeenCalledWith('a'.repeat(64));
    });

    it('still answers in-line when the cleanup fails too', async () => {
      markJobPending.mockRejectedValue(new Error('store unreachable'));
      discardJob.mockResolvedValue({
        failedDeletes: 3,
        firstFailure: new Error('store unreachable'),
      });

      await expect(start()).resolves.toBeNull();
    });
  });

  it.each([
    [
      'the drawing cannot be stored',
      '/input failed',
      (jobId: string) => putJobInput.mockRejectedValue(new Error(`put ${jobId}/input failed`)),
    ],
    [
      'the handoff fails',
      '/generate-image-background failed',
      (jobId: string) =>
        vi.stubGlobal(
          'fetch',
          vi.fn().mockRejectedValue(new Error(`post ${jobId}/generate-image-background failed`))
        ),
    ],
    [
      'ownership cannot be read after a failed handoff',
      '/status.json failed',
      (jobId: string) => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
        claimJob.mockRejectedValue(new Error(`read ${jobId}/status.json failed`));
      },
    ],
  ])(
    'keeps the job id out of the logs when %s and the error names the job key',
    async (_label, loggedText, fail) => {
      const jobId = 'a'.repeat(64);
      fail(jobId);

      await start();

      const logged = vi.mocked(console.error).mock.calls.flat().map(String);
      expect(logged).toContainEqual(expect.stringContaining(loggedText));
      expect(logged.join('\n')).not.toContain(jobId);
    }
  );

  it('still falls back when the cleanup itself fails', async () => {
    // The fallback is what the child experiences; the purge is the backstop for
    // the bytes. A failed delete must not turn a recoverable handoff failure
    // into a 500.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    discardJob.mockResolvedValue({
      failedDeletes: 3,
      firstFailure: new Error('store unreachable'),
    });

    await expect(start()).resolves.toBeNull();
  });

  // Without this line a drawing left at rest by a failed cleanup has no record
  // in the function log until the purge reaches it.
  it('logs the deletes a failed cleanup left behind without naming the job', async () => {
    const jobId = 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    discardJob.mockResolvedValue({
      failedDeletes: 1,
      firstFailure: new Error(`delete ${jobId}/input failed`),
    });

    await start();

    const logged = vi.mocked(console.warn).mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('failed deletes: 1');
    expect(logged).toContain('/input failed');
    expect(logged).not.toContain(jobId);
  });

  it('writes nothing at all when the signing secret is unset', async () => {
    issueWorkTicket.mockReturnValue(null);

    await expect(start()).resolves.toBeNull();
    expect(markJobPending).not.toHaveBeenCalled();
    expect(putJobInput).not.toHaveBeenCalled();
  });
});

describe('deadlineAfterFailedHandoffMs', () => {
  it('leaves the in-line call what the handoff did not spend', () => {
    expect(deadlineAfterFailedHandoffMs(5_000)).toBe(GENERATE_DEADLINE_MS - 5_000);
  });

  // Less than the quickest answer the model gives: the call could only end in
  // the deadline's 502, after it had been paid for.
  it('refuses when too little is left for the model to answer at all', () => {
    expect(deadlineAfterFailedHandoffMs(GENERATE_DEADLINE_MS - 1_000)).toBeNull();
  });

  it('refuses when the handoff spent the whole deadline', () => {
    expect(deadlineAfterFailedHandoffMs(GENERATE_DEADLINE_MS + 1)).toBeNull();
  });
});
