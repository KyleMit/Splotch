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

import type { DeviceInfo } from '$lib/platform/deviceReport';
import { MAX_REPORT_MESSAGE_LENGTH, REPORT_FORM_FIELDS } from '$lib/report';
import { MAX_REPORT_BODY_BYTES } from '$lib/server/report';
import { actions } from './+page.server';

async function post(body: BodyInit) {
  return actions.default({
    request: new Request('http://localhost/feedback', { method: 'POST', body }),
    getClientAddress: () => '203.0.113.9',
    setHeaders: vi.fn(),
  } as unknown as Parameters<typeof actions.default>[0]);
}

async function submit(fields: Record<string, string | Blob>) {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return post(body);
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

  // With JavaScript off the device opt-in stays rendered after the native radio
  // switches to an idea, so the post carries a ticked box and no snapshot. An
  // idea never carries device info, so it must not claim the browser failed to
  // collect some.
  it('files an idea posted with the device box still ticked without a device note', async () => {
    await submit({
      kind: 'feature',
      message: 'Add a glitter brush',
      includeDevice: 'on',
      device: '',
    }).catch((thrown: unknown) => thrown);

    expect(createIssue).toHaveBeenCalledOnce();
    expect(createIssue.mock.calls[0][0].body).not.toContain('device info');
  });

  // The trap only works while a caught bot cannot tell it was caught, so the
  // form door's answers are held against a real submission's rather than a
  // literal: a redirect that differed in any part would name the trap field.
  it('answers a honeypot submission with the same redirect as a real one and files nothing', async () => {
    const fields = { kind: 'bug', message: 'The crayon draws green' };

    const caught = await submit({
      ...fields,
      [REPORT_FORM_FIELDS.honeypot]: 'a bot filled this',
    }).catch((thrown: unknown) => thrown);
    expect(createIssue).not.toHaveBeenCalled();
    const real = await submit(fields).catch((thrown: unknown) => thrown);

    expect(createIssue).toHaveBeenCalledOnce();
    expect(isRedirect(real)).toBe(true);
    expect(caught).toEqual(real);
  });

  it.each([
    ['an unusable kind', { kind: 'nonsense', message: 'The crayon draws green' }],
    ['an empty message', { kind: 'bug', message: '   ' }],
  ])('answers %s the same whether or not the honeypot is filled', async (_label, fields) => {
    const caught = await submit({ ...fields, [REPORT_FORM_FIELDS.honeypot]: 'a bot filled this' });
    const real = await submit(fields);

    expect(real).toMatchObject({ status: 400 });
    expect(caught).toEqual(real);
    expect(createIssue).not.toHaveBeenCalled();
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

  // The /api/report twin answers 413 over this cap, and the form door is just as
  // unauthenticated, so it stops reading there too.
  it('refuses a body over the report cap without filing anything', async () => {
    const outcome = await post(
      new URLSearchParams({ kind: 'bug', message: 'x'.repeat(MAX_REPORT_BODY_BYTES) })
    );

    expect(outcome).toMatchObject({
      status: 413,
      data: { error: 'Request body is too large', values: { kind: 'bug', message: '' } },
    });
    expect(createIssue).not.toHaveBeenCalled();
  });

  // A form post is percent-encoded, which spends nine bytes on each three-byte
  // character; the cap must still admit the longest message the textarea lets a
  // reporter type, beside a device snapshot whose every field is escape-heavy.
  it('accepts the longest message the form allows in its costliest encoding', async () => {
    const fields = [
      'app',
      'platform',
      'os',
      'device',
      'browser',
      'screen',
      'viewport',
      'pixelRatio',
      'language',
      'display',
      'online',
    ] satisfies (keyof DeviceInfo)[];
    const device = Object.fromEntries(fields.map((key) => [key, '"'.repeat(200)]));
    const body = new URLSearchParams({
      kind: 'bug',
      message: 'あ'.repeat(MAX_REPORT_MESSAGE_LENGTH),
      includeDevice: 'on',
      device: JSON.stringify(device),
    });
    expect(new TextEncoder().encode(body.toString()).byteLength).toBeGreaterThan(
      MAX_REPORT_BODY_BYTES / 2
    );

    const outcome = await post(body).catch((thrown: unknown) => thrown);

    expect(isRedirect(outcome)).toBe(true);
    expect(createIssue).toHaveBeenCalledOnce();
  });

  // String() would have filed this as an issue reading "[object File]".
  it('refuses a message sent as a file instead of filing its string form', async () => {
    const outcome = await submit({ kind: 'bug', message: new Blob(['Add a glitter brush']) });

    expect(outcome).toMatchObject({
      status: 400,
      data: { error: 'Please type a short description.', values: { message: '' } },
    });
    expect(createIssue).not.toHaveBeenCalled();
  });
});
