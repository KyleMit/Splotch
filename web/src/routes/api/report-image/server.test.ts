// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeImageReport, isReportingConfigured, submitImageReport } = vi.hoisted(() => ({
  authorizeImageReport: vi.fn(),
  isReportingConfigured: vi.fn(),
  submitImageReport: vi.fn(),
}));

vi.mock('$lib/server/github', () => ({ isReportingConfigured }));
// Partial: the real MAX_REPORT_REQUEST_BYTES has to reach the route, so the size
// cap under test derives from the source constant instead of a mirrored copy.
vi.mock('$lib/server/imageReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/imageReport')>()),
  submitImageReport,
}));
vi.mock('$lib/server/imageReportAuthorization', () => ({ authorizeImageReport }));

import { ACCESS_TOKEN_HEADER, INSTALLATION_ID_HEADER, REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
import { MAX_REPORT_REQUEST_BYTES } from '$lib/server/imageReport';
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
      installationId: null,
      reportToken: null,
      clientAddress: '203.0.113.9',
    });
    expect(submitImageReport).toHaveBeenCalledWith({
      kind: null,
      drawing: expect.any(Blob),
      output: expect.any(Blob),
      style: 'Magical',
    });
  });

  // These two headers are the free tier's entire credential, so the route
  // dropping either is indistinguishable from the caller never sending one.
  it('forwards the free installation id and report token to the authorizer', async () => {
    const body = new FormData();
    body.set('drawing', new Blob(['drawing'], { type: 'image/png' }));
    body.set('output', new Blob(['output'], { type: 'image/jpeg' }));
    body.set('style', 'Magical');
    const installationId = 'a'.repeat(64);
    const reportToken = '1770000000000.deadbeef';

    await post(body, {
      [INSTALLATION_ID_HEADER]: installationId,
      [REPORT_TOKEN_HEADER]: reportToken,
    });

    expect(authorizeImageReport).toHaveBeenCalledWith({
      apiKey: null,
      token: null,
      installationId,
      reportToken,
      clientAddress: '203.0.113.9',
    });
  });

  // `submitImageReport` only ever weighs the two images it keeps, so without a
  // raw-body cap a caller could push arbitrary bytes through an effectively
  // public ingestion path by hiding them in a field the parser discards.
  it('rejects an oversized payload hidden in an unused form field', async () => {
    const body = new FormData();
    body.set('drawing', new Blob(['drawing'], { type: 'image/png' }));
    body.set('output', new Blob(['output'], { type: 'image/jpeg' }));
    body.set('style', 'Magical');
    body.set('padding', 'x'.repeat(MAX_REPORT_REQUEST_BYTES + 1));

    const response = await post(body);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'That AI report is too large to send.',
    });
    expect(submitImageReport).not.toHaveBeenCalled();
  });

  it('accepts a report whose images sit inside the cap', async () => {
    const body = new FormData();
    body.set('drawing', new Blob(['drawing'], { type: 'image/png' }));
    body.set('output', new Blob(['output'], { type: 'image/jpeg' }));
    body.set('style', 'Magical');

    const response = await post(body);

    expect(response.status).toBe(200);
    expect(submitImageReport).toHaveBeenCalledOnce();
  });

  it('hands a false-positive refusal to the core without inventing an output image', async () => {
    const body = new FormData();
    body.set('kind', 'false-positive-refusal');
    body.set('drawing', new Blob(['drawing'], { type: 'image/webp' }));
    body.set('style', 'Felt');

    const response = await post(body);

    expect(response.status).toBe(200);
    expect(submitImageReport).toHaveBeenCalledWith({
      kind: 'false-positive-refusal',
      drawing: expect.any(Blob),
      output: null,
      style: 'Felt',
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
