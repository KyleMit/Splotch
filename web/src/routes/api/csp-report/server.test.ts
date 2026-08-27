// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rateLimit } = vi.hoisted(() => ({
  rateLimit: vi.fn(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit }));

import { cspReportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { POST } from './+server';

const address = '198.51.100.142';
const key = cspReportBucket(address);
const MAX_ACCEPTED_BODY_BYTES = 32 * 1024;
const EXPECTED_REPORT_LIMIT = 10;
const EXPECTED_FIELD_LIMIT = 300;

function handle(request: Request) {
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

function post(contentType: string, body: unknown) {
  return postRaw(contentType, JSON.stringify(body));
}

function postRaw(contentType: string, body: string) {
  return handle(
    new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    })
  );
}

beforeEach(() => {
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/csp-report', () => {
  it('normalizes the legacy application/csp-report shape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post('application/csp-report', {
      'csp-report': {
        'document-uri': 'https://splotch.art/draw',
        'blocked-uri': 'https://cdn.example.com/paint.css',
        'violated-directive': 'style-src',
        disposition: 'report',
        'source-file': 'https://cdn.example.com/app.js',
        'line-number': 27,
        'column-number': 9,
        'script-sample': 'body { color: red; }',
      },
    });

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      '[csp-report]',
      JSON.stringify({
        documentURL: 'https://splotch.art/draw',
        blockedURL: 'https://cdn.example.com/paint.css',
        directive: 'style-src',
        disposition: 'report',
        sourceFile: 'https://cdn.example.com/app.js',
        line: 27,
        column: 9,
        sample: 'body { color: red; }',
      })
    );
  });

  it('normalizes csp-violation entries from application/reports+json', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post('application/reports+json; charset=utf-8', [
      {
        type: 'csp-violation',
        url: 'https://splotch.art/from-envelope',
        body: {
          blockedURL: 'data',
          effectiveDirective: 'img-src',
          disposition: 'enforce',
          sourceFile: 'https://splotch.art/app.js',
          lineNumber: 14,
          columnNumber: 3,
          sample: 'fetch(data)',
        },
      },
      { type: 'deprecation', body: {} },
    ]);

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      '[csp-report]',
      JSON.stringify({
        documentURL: 'https://splotch.art/from-envelope',
        blockedURL: 'data',
        directive: 'img-src',
        disposition: 'enforce',
        sourceFile: 'https://splotch.art/app.js',
        line: 14,
        column: 3,
        sample: 'fetch(data)',
      })
    );
  });

  it('accepts application/json for tooling', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post('application/json', {
      'csp-report': { 'effective-directive': 'connect-src' },
    });

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('rejects an unsupported content type', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await postRaw('text/plain', '{}');

    expect(response.status).toBe(415);
    expect(await response.text()).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects a body over 32 KiB', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await postRaw(
      'application/csp-report',
      'x'.repeat(MAX_ACCEPTED_BODY_BYTES + 1)
    );

    expect(response.status).toBe(413);
    expect(await response.text()).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('silently accepts malformed JSON', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await postRaw('application/csp-report', '{');

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs at most 10 reports from one payload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reports = Array.from({ length: EXPECTED_REPORT_LIMIT + 2 }, (_, index) => ({
      type: 'csp-violation',
      body: { documentURL: `https://splotch.art/report/${index}` },
    }));

    const response = await post('application/reports+json', reports);
    const loggedDocumentUrls = warn.mock.calls.map((call) =>
      String(JSON.parse(String(call[1])).documentURL)
    );

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(EXPECTED_REPORT_LIMIT);
    expect(loggedDocumentUrls).toEqual(
      Array.from(
        { length: EXPECTED_REPORT_LIMIT },
        (_, index) => `https://splotch.art/report/${index}`
      )
    );
  });

  it('caps strings and coerces non-string and non-finite fields', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const oversizedSample = 'x'.repeat(EXPECTED_FIELD_LIMIT + 1);

    const response = await postRaw(
      'application/csp-report',
      `{"csp-report":{"document-uri":42,"blocked-uri":false,"effective-directive":{},"disposition":[],"source-file":null,"line-number":"12.5","column-number":1e400,"script-sample":"${oversizedSample}"}}`
    );

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      '[csp-report]',
      JSON.stringify({
        documentURL: '',
        blockedURL: '',
        directive: '',
        disposition: 'enforce',
        sourceFile: '',
        line: null,
        column: null,
        sample: 'x'.repeat(EXPECTED_FIELD_LIMIT),
      })
    );
  });

  it.each([
    ['application/csp-report', null],
    ['application/reports+json', [{ type: 'deprecation', body: {} }]],
    ['application/json', { unrelated: true }],
  ])('answers accepted %s payloads with no usable reports', async (contentType, payload) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post(contentType, payload);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });

  it('throttles through the CSP report bucket', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rateLimit.mockReturnValue({ limited: true, retryAfter: 17 });

    const response = await postRaw('application/csp-report', '{}');

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('17');
    expect(rateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.cspReport);
    expect(warn).not.toHaveBeenCalled();
  });

  it('removes secrets from reported URLs while preserving CSP sentinels', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'document-uri':
            'https://user:p4ssw0rd@splotch.art/draw?session=top-secret#private-fragment',
          'blocked-uri': 'inline',
          'effective-directive': 'script-src-elem',
          'source-file': '//cdn.example.com/app.js?source-token=source-secret#source-fragment',
        },
      }),
    });

    const response = await POST({
      request,
      getClientAddress: () => '198.51.100.142',
    } as unknown as Parameters<typeof POST>[0]);
    const logLine = warn.mock.calls.flat().join(' ');

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      '[csp-report]',
      JSON.stringify({
        documentURL: 'https://splotch.art/draw',
        blockedURL: 'inline',
        directive: 'script-src-elem',
        disposition: 'enforce',
        sourceFile: '//cdn.example.com/app.js',
        line: null,
        column: null,
        sample: '',
      })
    );
    expect(logLine).toContain('https://splotch.art/draw');
    expect(logLine).toContain('//cdn.example.com/app.js');
    expect(logLine).not.toContain('user');
    expect(logLine).not.toContain('p4ssw0rd');
    expect(logLine).not.toContain('session=top-secret');
    expect(logLine).not.toContain('private-fragment');
    expect(logLine).not.toContain('source-token=source-secret');
    expect(logLine).not.toContain('source-fragment');
  });
});
