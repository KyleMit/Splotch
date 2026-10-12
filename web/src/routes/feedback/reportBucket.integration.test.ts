// @vitest-environment node
import { isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drives both report doors against the real rateLimit module (its shared
// module-level Map), because the guarantee under test — one write budget per
// IP across /api/report and this page's form (ADR-0014) — only holds if
// neither door brings its own bucket key.
const { createIssue } = vi.hoisted(() => ({ createIssue: vi.fn() }));
vi.mock('$lib/server/github', async (original) => ({
  ...(await original<typeof import('$lib/server/github')>()),
  isReportingConfigured: () => true,
  createIssue,
}));

import { REPORT_FORM_FIELDS } from '$lib/report';
import { throttledMessage } from '$lib/server/http';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { POST } from '../api/report/+server';
import { actions } from './+page.server';

const { limit } = rateLimitPolicy.report;

function jsonDoor(address: string) {
  const request = new Request('http://localhost/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'bug', message: 'The crayon draws green' }),
  });
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

// A successful submission answers by throwing its redirect, so the throw is
// returned as the outcome.
async function formDoor(address: string, setHeaders = vi.fn()): Promise<unknown> {
  const body = new FormData();
  body.set(REPORT_FORM_FIELDS.kind, 'feature');
  body.set(REPORT_FORM_FIELDS.message, 'Add a glitter brush');
  try {
    return await actions.default({
      request: new Request('http://localhost/feedback', { method: 'POST', body }),
      getClientAddress: () => address,
      setHeaders,
    } as unknown as Parameters<typeof actions.default>[0]);
  } catch (thrown) {
    return thrown;
  }
}

beforeEach(() => {
  createIssue.mockReset().mockResolvedValue(undefined);
});

// Each direction gets its own case so one door's regression can't mask the other's.
describe('the report doors (real rateLimit)', () => {
  it('throttles the form once the JSON endpoint has spent the budget, keeping what was typed', async () => {
    const address = '203.0.113.30';
    for (let i = 0; i < limit; i++) {
      expect((await jsonDoor(address)).status, `attempt ${i}`).toBe(200);
    }

    const setHeaders = vi.fn();
    const outcome = await formDoor(address, setHeaders);

    expect(setHeaders).toHaveBeenCalledOnce();
    const retryAfter = setHeaders.mock.calls[0][0]['Retry-After'];
    expect(retryAfter).toMatch(/^[1-9]\d*$/);
    expect(outcome).toMatchObject({
      status: 429,
      data: {
        error: throttledMessage(Number(retryAfter)),
        values: { kind: 'feature', message: 'Add a glitter brush', includeDevice: false },
      },
    });
    expect(createIssue).toHaveBeenCalledTimes(limit);
  });

  it('throttles the JSON endpoint once the form has spent the budget', async () => {
    const address = '203.0.113.31';
    for (let i = 0; i < limit; i++) {
      expect(isRedirect(await formDoor(address)), `attempt ${i}`).toBe(true);
    }

    const response = await jsonDoor(address);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toMatch(/^[1-9]\d*$/);
    expect(createIssue).toHaveBeenCalledTimes(limit);
  });
});
