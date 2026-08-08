// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeImageReport, isReportingConfigured, submitImageReport } = vi.hoisted(() => ({
  authorizeImageReport: vi.fn(),
  isReportingConfigured: vi.fn(),
  submitImageReport: vi.fn(),
}));

vi.mock('$lib/server/github', () => ({ isReportingConfigured }));
vi.mock('$lib/server/imageReport', () => ({ submitImageReport }));
vi.mock('$lib/server/imageReportAuthorization', () => ({ authorizeImageReport }));

import { ACCESS_TOKEN_HEADER } from '$lib/apiHeaders';
import { POST } from './+server';

function post(body: BodyInit, headers: HeadersInit = {}) {
  return POST({
    request: new Request('http://localhost/api/report-image', { method: 'POST', headers, body }),
    getClientAddress: () => '203.0.113.9',
  } as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
  isReportingConfigured.mockReset().mockReturnValue(true);
  authorizeImageReport.mockReset().mockResolvedValue({ authorized: true });
  submitImageReport.mockReset().mockResolvedValue({ ok: true, reportId: 'report-id' });
});

describe('POST /api/report-image', () => {
  it('authenticates before handing a multipart report to the shared core', async () => {
    const body = new FormData();
    body.set('drawing', new Blob(['drawing'], { type: 'image/png' }));
    body.set('output', new Blob(['output'], { type: 'image/jpeg' }));
    body.set('style', 'Magical');

    const response = await post(body, { [ACCESS_TOKEN_HEADER]: 'sunny-meadow' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reportId: 'report-id' });
    expect(authorizeImageReport).toHaveBeenCalledWith({
      apiKey: null,
      token: 'sunny-meadow',
      clientAddress: '203.0.113.9',
    });
    expect(submitImageReport).toHaveBeenCalledWith({
      drawing: expect.any(Blob),
      output: expect.any(Blob),
      style: 'Magical',
    });
  });

  it('fails before authorization or body parsing when private reporting is unconfigured', async () => {
    isReportingConfigured.mockReturnValue(false);

    const response = await post('not multipart');

    expect(response.status).toBe(503);
    expect(authorizeImageReport).not.toHaveBeenCalled();
    expect(submitImageReport).not.toHaveBeenCalled();
  });

  it('returns an authorization failure before parsing the image body', async () => {
    authorizeImageReport.mockResolvedValue({
      authorized: false,
      response: Response.json({ ok: false, error: 'Invalid access token' }, { status: 403 }),
    });

    const response = await post('not multipart');

    expect(response.status).toBe(403);
    expect(submitImageReport).not.toHaveBeenCalled();
  });
});
