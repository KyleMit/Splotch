// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  reserveGrant: vi.fn(),
  reserveDaily: vi.fn(),
  failGrant: vi.fn(),
  completeGrant: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock('$lib/server/generationAuthorization', () => ({
  authorizeGenerationRequest: mocks.authorize,
}));
vi.mock('$lib/server/freeGenerationGrants', () => ({
  reserveFreeGeneration: mocks.reserveGrant,
  reserveDailyFreeGeneration: mocks.reserveDaily,
  failFreeGeneration: mocks.failGrant,
  completeFreeGeneration: mocks.completeGrant,
}));
vi.mock('$lib/server/ai/provider', () => ({
  aiProvider: { generateImage: mocks.generateImage },
}));
vi.mock('$lib/server/usage', () => ({
  recordByokUsage: vi.fn(),
  recordTokenUsage: vi.fn(),
}));

import { POST } from './+server';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({
    authorized: true,
    kind: 'free',
    effectiveKey: 'project-key',
    installationId: 'a'.repeat(64),
  });
  mocks.reserveGrant.mockResolvedValue({ reserved: true, reservationId: 'reservation-1' });
  mocks.reserveDaily.mockResolvedValue({ reserved: false, remaining: 0 });
  mocks.failGrant.mockResolvedValue(undefined);
});

describe('POST /api/generate-image', () => {
  it('routes the daily ceiling to setup and records its own failure kind', async () => {
    const request = new Request('http://localhost/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array([1]),
    });

    const response = await POST({
      request,
      url: new URL(request.url),
      getClientAddress: () => '198.51.100.1',
      platform: undefined,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'FREE_DAILY_LIMIT_EXHAUSTED',
      error: 'Free creations are unavailable today. Add your own Gemini key to keep creating.',
    });
    expect(mocks.failGrant).toHaveBeenCalledWith('a'.repeat(64), 'daily-limit', 'reservation-1');
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });
});
