// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './+server';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/csp-report', () => {
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
