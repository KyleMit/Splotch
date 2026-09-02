import { describe, expect, it, vi } from 'vitest';
import { GENERATION_POLL_TIMEOUT_MS } from '$lib/ai/limits';
import { awaitGeneration } from './aiGenerationPoll';

// `fetchResult` is the injected seam, so the loop is driven here without a
// network and without waiting out its real intervals — fake timers make the
// sleeps instant.

const accepted = () => new Response(null, { status: 202 });
const picture = () => new Response(new Blob(['png']), { status: 200 });
const throttled = () =>
  new Response(JSON.stringify({ ok: false, error: 'slow down' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
  });
const unavailable = () =>
  new Response(JSON.stringify({ ok: false, code: 'GENERATION_UNAVAILABLE', error: 'not now' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
const refused = () =>
  new Response(JSON.stringify({ ok: false, error: 'blocked' }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  });

async function run(
  responses: (() => Response | Promise<Response>)[],
  { signal = new AbortController().signal } = {}
) {
  let call = 0;
  const promise = awaitGeneration('job', 0, signal, {
    fetchResult: async () => responses[Math.min(call++, responses.length - 1)](),
  });
  await vi.runAllTimersAsync();
  return promise;
}

describe('awaitGeneration', () => {
  it('keeps waiting while the job is pending, then returns the picture', async () => {
    vi.useFakeTimers();
    try {
      const settled = await run([accepted, accepted, picture]);
      expect(settled.kind).toBe('image');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a safety refusal as a refusal, not as something to retry', async () => {
    vi.useFakeTimers();
    try {
      expect((await run([accepted, refused])).kind).toBe('safety');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting through a failed poll rather than discarding a paid picture', async () => {
    vi.useFakeTimers();
    try {
      const flaky = () => {
        throw new TypeError('network down');
      };
      expect((await run([flaky, picture])).kind).toBe('image');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting through a throttled poll instead of abandoning a paid picture', async () => {
    vi.useFakeTimers();
    try {
      expect((await run([accepted, throttled, picture])).kind).toBe('image');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting when the store is momentarily unreadable', async () => {
    // An unreadable store says nothing about the job — the picture may be
    // sitting there finished. Only a machine-readable code can separate this
    // from a generation that genuinely failed.
    vi.useFakeTimers();
    try {
      expect((await run([accepted, unavailable, picture])).kind).toBe('image');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up as retryable once it has waited longer than a child would', async () => {
    vi.useFakeTimers();
    try {
      // Never settles, so the sleeps run the budget out on their own.
      expect(await run([accepted])).toMatchObject({ kind: 'error', status: 504 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds a poll request that never answers', async () => {
    // The deadline used to be read from a clock before each await, which bounds
    // only the gaps between requests. A fetch that never settles left the loop
    // parked on it forever — and by then generateAiImage has cleared the request
    // timer it set before the job ticket arrived, so nothing else was watching.
    vi.useFakeTimers();
    try {
      const seen: AbortSignal[] = [];
      const settled = awaitGeneration('job', 0, new AbortController().signal, {
        fetchResult: (_id, pollSignal) =>
          new Promise((_resolve, reject) => {
            seen.push(pollSignal);
            pollSignal.addEventListener('abort', () => reject(pollSignal.reason), { once: true });
          }),
      });

      await vi.advanceTimersByTimeAsync(GENERATION_POLL_TIMEOUT_MS + 1);

      await expect(settled).resolves.toMatchObject({ kind: 'error', status: 504 });
      expect(seen[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells its own deadline apart from the child closing the modal', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const promise = awaitGeneration('job', 0, controller.signal, {
        fetchResult: (_id, pollSignal) =>
          new Promise((_resolve, reject) => {
            pollSignal.addEventListener('abort', () => reject(pollSignal.reason), { once: true });
          }),
      });
      // Attach the expectation before the timers advance: the rejection is otherwise
      // unhandled for a tick and reported as an error even though it is asserted.
      // eslint-disable-next-line vitest/valid-expect -- awaited below as `settled`; the rule only sees the statement it is declared in
      const settled = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

      await vi.advanceTimersByTimeAsync(1);
      controller.abort();
      await vi.runAllTimersAsync();
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates an abort instead of turning it into a retry', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const promise = awaitGeneration('job', 5_000, controller.signal, {
        fetchResult: async () => accepted(),
      });
      // Attach the expectation before aborting: the rejection is otherwise
      // unhandled for a tick and reported as an error even though it is asserted.
      // eslint-disable-next-line vitest/valid-expect -- awaited below as `settled`; the rule only sees the statement it is declared in
      const settled = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await vi.runAllTimersAsync();
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});
