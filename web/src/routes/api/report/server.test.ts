// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rateLimit, createIssue } = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  createIssue: vi.fn(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit }));
vi.mock('$lib/server/github', async (original) => ({
  ...(await original<typeof import('$lib/server/github')>()),
  isReportingConfigured: () => true,
  createIssue,
}));

import { REPORT_HONEYPOT_FIELD } from '$lib/report';
import { reportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { POST } from './+server';

const address = '203.0.113.9';
const key = reportBucket(address);

function handle(request: Request) {
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

function post(body: unknown) {
  return handle(
    new Request('http://localhost/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

/**
 * A request whose body rejects on any read, by any method. It is what makes
 * "before reading the body" checkable rather than asserted: a handler that
 * touches the body ahead of the limiter gets readJsonBody's 400 instead of the
 * throttle, so the assertion fails on the reorder rather than on a payload that
 * happened to parse either way.
 */
function postUnreadableBody() {
  const body = new ReadableStream({
    start: (controller) => controller.error(new Error('body read before the rate limit')),
  });
  return handle(
    new Request('http://localhost/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // A streamed request body needs an explicit duplex, which lib.dom's
      // RequestInit does not yet carry.
      duplex: 'half',
    } as RequestInit)
  );
}

beforeEach(() => {
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  createIssue.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/report', () => {
  it('opens an issue for a valid submission', async () => {
    const response = await post({ kind: 'bug', message: 'the crayon is stuck' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.report);
  });

  it('throttles a limited IP before reading the body', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 30 });

    const response = await postUnreadableBody();

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(createIssue).not.toHaveBeenCalled();
  });

  // Load-bearing ordering, not an incidental one: tools/api-smoke/run-local-contract.mjs bursts
  // past this endpoint's limit with honeypotted payloads so the run can never
  // open a real issue whatever GITHUB_ISSUE_TOKEN the server was given, and it
  // still asserts the 429. Charging the bucket after the honeypot short-circuit
  // would silently disarm that safety; junk `[Bug] burst 0` issues in the
  // tracker are the failure mode this protects against.
  it('charges the bucket for a honeypot submission and opens no issue', async () => {
    const response = await post({
      kind: 'bug',
      message: 'burst 0',
      [REPORT_HONEYPOT_FIELD]: 'smoke-burst',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.report);
    expect(createIssue).not.toHaveBeenCalled();
  });

  // The honeypot's whole value is that a caught bot cannot tell it was caught.
  // That holds only while the two success paths are byte-identical on the wire,
  // which no single-path assertion can see: adding an issue url or number to the
  // real success would leave every test above green and hand a bot a one-request
  // oracle for which field the trap is. So the two are compared to each other.
  it('answers a honeypot submission exactly as it answers a real one', async () => {
    const caught = await post({
      kind: 'bug',
      message: 'The crayon draws green',
      [REPORT_HONEYPOT_FIELD]: 'a bot filled this',
    });
    const real = await post({ kind: 'bug', message: 'The crayon draws green' });

    expect(createIssue).toHaveBeenCalledOnce();
    expect(caught.status).toBe(real.status);
    expect(await caught.text()).toBe(await real.text());
    // The whole header set, not just content-type: a Retry-After, a Set-Cookie,
    // or a cache directive on one path and not the other is the same oracle in a
    // different field.
    expect([...caught.headers]).toEqual([...real.headers]);
  });

  // The oracle the honeypot's value depends on is not only in the success shape:
  // short-circuiting before validation answered a caught bot 200 while a real
  // submitter with the same bad payload got 400, which names the trap field in
  // one request. Every rejection path is therefore held against its honeypot twin.
  it.each([
    ['an unusable kind', { kind: 'nonsense', message: 'The crayon draws green' }],
    ['an empty message', { kind: 'bug', message: '   ' }],
  ])('answers %s the same whether or not the honeypot is filled', async (_label, payload) => {
    const caught = await post({ ...payload, [REPORT_HONEYPOT_FIELD]: 'a bot filled this' });
    const real = await post(payload);

    expect(caught.status).toBe(real.status);
    expect(await caught.text()).toBe(await real.text());
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('charges the bucket for a rejected submission', async () => {
    const response = await post({ kind: 'bug', message: '   ' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Please type a short description.',
    });
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(createIssue).not.toHaveBeenCalled();
  });
});
