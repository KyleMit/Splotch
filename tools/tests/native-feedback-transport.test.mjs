import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sendFeedback,
  MAX_FEEDBACK_REPLY_BYTES,
} from '../../experiments/native-architecture/src/feedback/feedbackTransport.ts';
import { NETWORK_ERROR_MESSAGE } from '../../web/src/lib/latestRequest.ts';
const body = { kind: 'bug', message: 'Fixture feedback', hp: '' };
const response = (raw, status = 200, headers = {}) =>
  new Response(typeof raw === 'string' ? raw : JSON.stringify(raw), { status, headers });
const run = (reply) => sendFeedback(async () => reply, body, new AbortController());
const SLOW_REPORT_MS = 60000;
afterEach(() => vi.useRealTimers());
describe('shipping feedback delivery', () => {
  it.each([{ ok: true }, { ok: true, reportId: 'private-id' }])(
    'accepts the same successful reply as shipping %j',
    async (raw) => {
      expect(await run(response(raw))).toEqual({
        status: 'success',
        message: 'Thanks for your feedback.',
      });
    }
  );
  it.each([null, [], { ok: 'true' }, { ok: false }, { error: 4 }, '<html>proxy error</html>'])(
    'uses shipping copy for an unreadable reply %j',
    async (raw) => {
      expect(await run(response(raw))).toEqual({
        status: 'malformed',
        message: 'Could not read the server response.',
      });
    }
  );
  it.each([400, 429, 502, 503])(
    'surfaces the server reason at status %s without imposing a cooldown',
    async (status) => {
      expect(
        await run(
          response({ ok: false, error: 'Please wait 12s.' }, status, { 'Retry-After': '12' })
        )
      ).toEqual({ status: 'error', message: 'Please wait 12s.' });
    }
  );
  it('accepts a proxy error without the discriminator and treats any successful HTTP status as successful', async () => {
    expect(await run(response({ error: 'Proxy unavailable' }, 502))).toEqual({
      status: 'error',
      message: 'Proxy unavailable',
    });
    expect((await run(response({ ok: true }, 201))).status).toBe('success');
    expect(await run(response({ ok: true }, 502))).toEqual({
      status: 'error',
      message: 'Could not send your report. Please try again.',
    });
  });
  it('uses the shared shipping connection copy without surfacing an exception', async () => {
    const result = await sendFeedback(
      async () => {
        throw new Error('private network detail');
      },
      body,
      new AbortController()
    );
    expect(result).toEqual({ status: 'connection', message: NETWORK_ERROR_MESSAGE });
  });
  it('leaves a slow report sending until its actual response and never aborts it on a local deadline', async () => {
    vi.useFakeTimers();
    let finish;
    const controller = new AbortController();
    const transport = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let settled = false;
    const sending = sendFeedback(transport, body, controller).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(SLOW_REPORT_MS);
    expect(settled).toBe(false);
    expect(controller.signal.aborted).toBe(false);
    expect(transport).toHaveBeenCalledOnce();
    finish(response({ ok: true }));
    expect((await sending).status).toBe('success');
  });
  it('cancels a response stream at its first oversized chunk without reading the rest', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(MAX_FEEDBACK_REPLY_BYTES + 1));
      },
      cancel,
    });
    expect((await run(new Response(stream))).status).toBe('malformed');
    expect(cancel).toHaveBeenCalledOnce();
    expect(pulls).toBeLessThanOrEqual(2);
  });
  it('resolves an explicit cancellation even if the transport ignores abort', async () => {
    const controller = new AbortController();
    const sending = sendFeedback(() => new Promise(() => {}), body, controller);
    controller.abort();
    expect((await sending).status).toBe('cancelled');
  });
});
