// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { discardJob, issueWorkTicket, markJobPending, putJobInput } = vi.hoisted(() => ({
  discardJob: vi.fn(),
  issueWorkTicket: vi.fn(),
  markJobPending: vi.fn(),
  putJobInput: vi.fn(),
}));

vi.mock('./generationJobs', () => ({
  discardJob,
  issueWorkTicket,
  markJobPending,
  putJobInput,
  newJobId: () => 'a'.repeat(64),
}));
vi.mock('./config', () => ({ config: { reportTokenSecret: () => 'test-secret' } }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { startBackgroundGeneration } from './generationStart';

const context = { free: null, style: null };
const image = { bytes: new ArrayBuffer(8), mimeType: 'image/png' };
const work = { apiKey: 'sk-test', prompt: 'draw a cat' };

const start = () => startBackgroundGeneration('https://splotch.art', context, image, work);

beforeEach(() => {
  discardJob.mockReset().mockResolvedValue(undefined);
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
    expect(discardJob).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('still falls back when the cleanup itself fails', async () => {
    // The fallback is what the child experiences; the purge is the backstop for
    // the bytes. A failed delete must not turn a recoverable handoff failure
    // into a 500.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    discardJob.mockRejectedValue(new Error('store unreachable'));

    await expect(start()).resolves.toBeNull();
  });

  it('writes nothing at all when the signing secret is unset', async () => {
    issueWorkTicket.mockReturnValue(null);

    await expect(start()).resolves.toBeNull();
    expect(markJobPending).not.toHaveBeenCalled();
    expect(putJobInput).not.toHaveBeenCalled();
  });
});
