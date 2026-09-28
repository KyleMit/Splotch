// @vitest-environment node
import { isRedirect } from '@sveltejs/kit';
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

import { actions } from './+page.server';

async function submit(fields: Record<string, string>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return actions.default({
    request: new Request('http://localhost/feedback', { method: 'POST', body }),
    getClientAddress: () => '203.0.113.9',
    setHeaders: vi.fn(),
  } as unknown as Parameters<typeof actions.default>[0]);
}

beforeEach(() => {
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  createIssue.mockReset().mockResolvedValue(undefined);
});

describe('/feedback form action', () => {
  it('files a submitted idea under its own kind', async () => {
    const outcome = await submit({ kind: 'feature', message: 'Add a glitter brush' }).catch(
      (thrown: unknown) => thrown
    );

    expect(isRedirect(outcome)).toBe(true);
    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['user-report', 'type:feature'] })
    );
  });

  // The radio group always sends one of REPORT_KINDS, so any other value is a
  // crafted post. It gets the JSON endpoint's refusal instead of being filed as
  // a bug; the echo still needs a kind the picker can render.
  it.each([
    ['an unknown kind', { kind: 'question', message: 'Where is the glitter?' }],
    ['no kind at all', { message: 'Where is the glitter?' }],
  ])('refuses %s rather than filing it as a bug', async (_label, fields) => {
    const outcome = await submit(fields);

    expect(outcome).toMatchObject({
      status: 400,
      data: {
        error: 'Please choose bug or feature.',
        values: { kind: 'bug', message: 'Where is the glitter?' },
      },
    });
    expect(createIssue).not.toHaveBeenCalled();
  });
});
