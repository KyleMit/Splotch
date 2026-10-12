// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rateLimit, createIssue, authorizeImageReport, submitImageReport } = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  createIssue: vi.fn(),
  authorizeImageReport: vi.fn(),
  submitImageReport: vi.fn(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit }));
vi.mock('$lib/server/github', async (original) => ({
  ...(await original<typeof import('$lib/server/github')>()),
  isReportingConfigured: () => true,
  createIssue,
}));
vi.mock('$lib/server/imageReportAuthorization', () => ({ authorizeImageReport }));
vi.mock('$lib/server/imageReport', async (original) => ({
  ...(await original<typeof import('$lib/server/imageReport')>()),
  submitImageReport,
}));

import { REPORT_HONEYPOT_FIELD } from '$lib/report';
import { POST as reportRoute } from '../routes/api/report/+server';
import { POST as reportImageRoute } from '../routes/api/report-image/+server';
import { postFeedbackReport, postImageReport, readReportReply } from './reportClient';

// Every request the client builds is handed to the real route handler for its
// path, so a field renamed on one side alone fails here: each side's own tests
// pin only that side's literals.
function serveReportRoutes() {
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    const request = new Request(new URL(input, 'http://localhost'), init);
    const event = { request, getClientAddress: () => '203.0.113.9' };
    const { pathname } = new URL(request.url);
    if (pathname === '/api/report') {
      return reportRoute(event as unknown as Parameters<typeof reportRoute>[0]);
    }
    if (pathname === '/api/report-image') {
      return reportImageRoute(event as unknown as Parameters<typeof reportImageRoute>[0]);
    }
    throw new Error(`No report route at ${pathname}`);
  });
}

const signal = new AbortController().signal;

beforeEach(() => {
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  createIssue.mockReset().mockResolvedValue(undefined);
  authorizeImageReport.mockReset().mockResolvedValue({ authorized: true, reportContext: null });
  submitImageReport.mockReset().mockResolvedValue({ ok: true, reportId: 'report-id' });
  serveReportRoutes();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the feedback report over the wire', () => {
  it('files the kind, message, and device the client sent', async () => {
    const response = await postFeedbackReport(
      { kind: 'bug', message: 'The crayon draws green', device: { platform: 'Web' } },
      signal
    );

    expect(await readReportReply(response, signal)).toEqual({ ok: true });
    expect(createIssue).toHaveBeenCalledOnce();
    const issue = createIssue.mock.calls[0][0];
    expect(issue.title).toBe('[Bug] The crayon draws green');
    expect(issue.labels).toEqual(['user-report', 'type:bug']);
    expect(issue.body).toContain('- **Platform:** Web');
  });

  it('files an idea under its own kind', async () => {
    await postFeedbackReport({ kind: 'feature', message: 'Add a glitter brush' }, signal);

    expect(createIssue.mock.calls[0][0].labels).toEqual(['user-report', 'type:feature']);
  });

  it('delivers the honeypot under the name the server traps', async () => {
    const response = await postFeedbackReport(
      { kind: 'bug', message: 'burst 0', [REPORT_HONEYPOT_FIELD]: 'a bot filled this' },
      signal
    );

    expect(await readReportReply(response, signal)).toEqual({ ok: true });
    expect(createIssue).not.toHaveBeenCalled();
  });
});

describe('the AI image report over the wire', () => {
  it('delivers a picture report field for field', async () => {
    const response = await postImageReport(
      {
        kind: 'picture',
        drawing: new Blob(['drawing'], { type: 'image/png' }),
        output: new Blob(['output'], { type: 'image/jpeg' }),
        style: 'Magical',
      },
      { 'X-Access-Token': 'sunny-meadow' },
      signal
    );

    expect(await readReportReply(response, signal)).toEqual({ ok: true, reportId: 'report-id' });
    const [fields] = submitImageReport.mock.calls[0];
    expect(fields).toMatchObject({ kind: 'picture', style: 'Magical', reportContext: null });
    expect(await fields.drawing.text()).toBe('drawing');
    expect(fields.drawing.type).toBe('image/png');
    expect(await fields.output.text()).toBe('output');
    expect(authorizeImageReport).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'sunny-meadow' })
    );
  });

  it('sends a refusal report with no output part and an empty style', async () => {
    await postImageReport(
      {
        kind: 'false-positive-refusal',
        drawing: new Blob(['drawing'], { type: 'image/webp' }),
        output: null,
        style: null,
      },
      {},
      signal
    );

    expect(submitImageReport).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'false-positive-refusal', output: null, style: '' })
    );
  });
});

describe('readReportReply', () => {
  const reply = (body: BodyInit | null, status = 200) =>
    readReportReply(new Response(body, { status }), signal);

  it('reads a success with and without a report id', async () => {
    expect(await reply('{"ok":true}')).toEqual({ ok: true });
    expect(await reply('{"ok":true,"reportId":"r-1"}')).toEqual({ ok: true, reportId: 'r-1' });
  });

  it('reads a failure that says why', async () => {
    expect(await reply('{"ok":false,"error":"Please type a short description."}', 400)).toEqual({
      ok: false,
      error: 'Please type a short description.',
    });
  });

  it('keeps the reason from an error-only body with no ok field', async () => {
    expect(await reply('{"error":"Reporting is unavailable"}', 503)).toEqual({
      ok: false,
      error: 'Reporting is unavailable',
    });
  });

  // Each of these once reached the parent as a blank error line or as a
  // network failure the network never had.
  it.each([
    ['a failure with no error', '{"ok":false}'],
    ['a non-string error', '{"ok":false,"error":{"code":1}}'],
    ['a JSON null', 'null'],
    ['a body with no ok', '{"message":"Internal Error"}'],
    ['a non-JSON error page', '<html>Bad gateway</html>'],
    ['an empty body', null],
  ])('reads %s as no usable reply', async (_label, body) => {
    expect(await reply(body, 502)).toBeNull();
  });

  // What fetch does to a body still arriving when its signal aborts.
  function bodyCutShortBy(controller: AbortController) {
    return new ReadableStream({
      start(stream) {
        controller.signal.addEventListener('abort', () => stream.error(controller.signal.reason));
      },
    });
  }

  it('rethrows a read its own abort cut short, for the caller to classify', async () => {
    const controller = new AbortController();
    const read = readReportReply(new Response(bodyCutShortBy(controller)), controller.signal);
    controller.abort();

    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reads a body that broke off with no abort as no usable reply', async () => {
    const other = new AbortController();
    const read = readReportReply(new Response(bodyCutShortBy(other)), signal);
    other.abort();

    expect(await read).toBeNull();
  });
});
