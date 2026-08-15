// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState, getDailyStatus, getGrantStatus, rateLimit } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  getDailyStatus: vi.fn(),
  getGrantStatus: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('$lib/server/freeGenerationGrants', () => ({
  getDailyFreeGenerationStatus: getDailyStatus,
  getFreeGenerationGrantStatus: getGrantStatus,
  isInstallationId: (value: string | null) => /^[a-f0-9]{64}$/.test(value ?? ''),
}));
vi.mock('$lib/server/rateLimit', () => ({ rateLimit }));

import { GET } from './+server';

function getStatus(installationId: string = 'a'.repeat(64)) {
  const request = new Request('http://localhost/api/free-generation-grant', {
    headers: { 'X-Installation-Id': installationId },
  });
  return GET({ request, getClientAddress: () => '198.51.100.1' } as unknown as Parameters<
    typeof GET
  >[0]);
}

beforeEach(() => {
  envState.OPENAI_API_KEY = 'managed-key';
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  getDailyStatus.mockReset().mockResolvedValue({ available: true, starts: 0 });
  getGrantStatus.mockReset().mockResolvedValue({ remaining: 8 });
});

describe('GET /api/free-generation-grant', () => {
  // The endpoint is an unauthenticated per-installation balance oracle, so the
  // throttle and the id validation are its only gates. Both were green under
  // deletion until the issue-1066 kill-check pinned them here.
  it('throttles a limited IP before validating anything', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 30 });

    // A malformed id is what makes the ordering observable: were the id check
    // hoisted above the throttle, this would answer 400 instead of 429.
    const response = await getStatus('not-an-installation-id');

    expect(response.status).toBe(429);
    expect(getDailyStatus).not.toHaveBeenCalled();
    expect(getGrantStatus).not.toHaveBeenCalled();
  });

  it('rejects a malformed installation id without reading any grant state', async () => {
    const response = await getStatus('not-an-installation-id');

    expect(response.status).toBe(400);
    expect(getDailyStatus).not.toHaveBeenCalled();
    expect(getGrantStatus).not.toHaveBeenCalled();
  });

  it('reports unavailable without a configured project key', async () => {
    envState.OPENAI_API_KEY = undefined;

    const response = await getStatus();

    expect(response.status).toBe(503);
    expect(getDailyStatus).not.toHaveBeenCalled();
    expect(getGrantStatus).not.toHaveBeenCalled();
  });

  it('reports unavailable after the daily provider-start ceiling is exhausted', async () => {
    getDailyStatus.mockResolvedValue({ available: false, starts: 500 });

    const response = await getStatus();

    expect(response.status).toBe(503);
    expect(getGrantStatus).not.toHaveBeenCalled();
  });

  it('returns the installation balance while the free path is usable', async () => {
    const response = await getStatus();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, remaining: 8, limit: 10 });
  });
});
