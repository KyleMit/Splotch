import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sendFeedback,
  FEEDBACK_TIMEOUT_MS,
  MAX_FEEDBACK_REPLY_BYTES,
  MAX_RETRY_AFTER_SECONDS,
} from '../../experiments/native-architecture/src/feedback/feedbackTransport.ts';
const body = { kind: 'bug', message: 'Fixture feedback', hp: '' };
const response = (raw, status = 200, headers = {}) =>
  new Response(typeof raw === 'string' ? raw : JSON.stringify(raw), { status, headers });
const run = (reply, offline = false) =>
  sendFeedback(
    async () => reply,
    body,
    new AbortController(),
    () => offline
  );
afterEach(() => vi.useRealTimers());
describe('bounded native feedback replies', () => {
  it('accepts only the ordinary exact success shape', async () => {
    expect((await run(response({ ok: true }))).status).toBe('success');
  });
  it.each([
    null,
    [],
    { ok: 'true' },
    { ok: true, reportId: 'private-id' },
    { error: 'missing discriminator' },
    { ok: false },
    { ok: false, error: 4 },
    '<html>proxy error</html>',
  ])('rejects malformed reply %j', async (raw) => {
    expect((await run(response(raw))).status).toBe('malformed');
  });
  it.each([
    [200, { ok: false, error: 'failure' }],
    [502, { ok: true }],
    [201, { ok: true }],
  ])('rejects a status/body contradiction %s', async (status, raw) => {
    expect((await run(response(raw, status))).status).toBe('malformed');
  });
  it('never surfaces raw server or transport exception text', async () => {
    const secret = 'raw provider token=fixture-sensitive-detail';
    expect((await run(response({ ok: false, error: secret }, 502))).message).not.toContain(secret);
    const result = await sendFeedback(
      async () => {
        throw new Error(secret);
      },
      body,
      new AbortController(),
      () => false
    );
    expect(result.message).not.toContain(secret);
    expect(result.status).toBe('offline');
    expect(result.message).toContain('may be offline');
  });
  it('does no transport work when known offline', async () => {
    const transport = vi.fn();
    const result = await sendFeedback(transport, body, new AbortController(), () => true);
    expect(result.status).toBe('offline');
    expect(transport).not.toHaveBeenCalled();
  });
  it('classifies and bounds the throttle delay', async () => {
    const result = await run(
      response({ ok: false, error: 'throttle' }, 429, { 'Retry-After': '999999' })
    );
    expect(result).toMatchObject({
      status: 'throttled',
      retryAfterSeconds: MAX_RETRY_AFTER_SECONDS,
    });
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
    const result = await run(new Response(stream));
    expect(result.status).toBe('malformed');
    expect(cancel).toHaveBeenCalledOnce();
    expect(pulls).toBeLessThanOrEqual(2);
  });
  it('aborts and resolves a stalled body read at the same deadline as the request', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const controller = new AbortController();
    const stream = new ReadableStream({ start() {}, cancel });
    const result = sendFeedback(
      async () => new Response(stream),
      body,
      controller,
      () => false
    );
    await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS);
    expect((await result).status).toBe('timeout');
    expect(controller.signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('resolves explicit cancellation even if the transport ignores abort', async () => {
    const controller = new AbortController();
    const sending = sendFeedback(
      () => new Promise(() => {}),
      body,
      controller,
      () => false
    );
    controller.abort();
    expect((await sending).status).toBe('cancelled');
  });
});
