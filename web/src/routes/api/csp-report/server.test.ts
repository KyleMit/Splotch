// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './+server';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/csp-report', () => {
  it('strips query strings and fragments from a reported document URL before logging', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = new Request('http://localhost/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'document-uri': 'https://splotch.art/draw?session=top-secret#private-fragment',
          'blocked-uri': 'inline',
          'effective-directive': 'script-src-elem',
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
        sourceFile: '',
        line: null,
        column: null,
        sample: '',
      })
    );
    expect(logLine).toContain('https://splotch.art/draw');
    expect(logLine).not.toContain('session=top-secret');
    expect(logLine).not.toContain('private-fragment');
  });
});
