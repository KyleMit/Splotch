// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  readJob: vi.fn(),
  discardJob: vi.fn(),
  takeJobImage: vi.fn(),
  completeFreeGeneration: vi.fn(),
  failFreeGeneration: vi.fn(),
  issueReportToken: vi.fn(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('$lib/server/generationJobs', () => ({
  readJob: mocks.readJob,
  discardJob: mocks.discardJob,
  takeJobImage: mocks.takeJobImage,
}));
vi.mock('$lib/server/freeGenerationGrants', () => ({
  completeFreeGeneration: mocks.completeFreeGeneration,
  failFreeGeneration: mocks.failFreeGeneration,
}));
vi.mock('$lib/server/reportToken', () => ({ issueReportToken: mocks.issueReportToken }));

import { API_KEY_HEADER, REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
import { SAFETY_REFUSAL_STATUS } from '$lib/drawing/aiImageResponse';
import { GET } from './+server';

const jobId = 'a'.repeat(64);

function get() {
  const request = new Request(`http://localhost/api/generation-result?job=${jobId}`, {
    headers: { [API_KEY_HEADER]: 'parent-key' },
  });
  return GET({
    request,
    url: new URL(request.url),
    getClientAddress: () => '198.51.100.2',
  } as unknown as Parameters<typeof GET>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockReturnValue({ limited: false, retryAfter: 0 });
  mocks.readJob.mockResolvedValue({
    status: 'refusal',
    reason: 'IMAGE_SAFETY',
    context: { free: null, style: null },
  });
  mocks.discardJob.mockResolvedValue(undefined);
  mocks.issueReportToken.mockReturnValue('signed-report-token');
});

describe('GET /api/generation-result', () => {
  it('returns the shared safety refusal status for a background result', async () => {
    const response = await get();

    expect(response.status).toBe(SAFETY_REFUSAL_STATUS);
    expect(response.headers.get(REPORT_TOKEN_HEADER)).toBe('signed-report-token');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Drawing was blocked for safety: IMAGE_SAFETY',
    });
    expect(mocks.discardJob).toHaveBeenCalledWith(jobId);
    expect(mocks.issueReportToken).toHaveBeenCalledWith(
      { kind: 'byok', credential: 'parent-key' },
      { kind: 'false-positive-refusal', refusalReason: 'IMAGE_SAFETY' }
    );
  });
});
