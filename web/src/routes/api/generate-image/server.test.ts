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

import { FREE_GENERATIONS_REMAINING_HEADER } from '$lib/apiHeaders';
import { POST } from './+server';

function post() {
  const request = new Request('http://localhost/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array([1]),
  });
  return POST({
    request,
    url: new URL(request.url),
    getClientAddress: () => '198.51.100.1',
    platform: undefined,
  } as unknown as Parameters<typeof POST>[0]);
}

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
    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'FREE_DAILY_LIMIT_EXHAUSTED',
      error: 'Free creations are unavailable today. Add your own Gemini key to keep creating.',
    });
    expect(mocks.failGrant).toHaveBeenCalledWith('a'.repeat(64), 'daily-limit', 'reservation-1');
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it('still delivers the image when the allowance ledger cannot be updated', async () => {
    mocks.reserveDaily.mockResolvedValue({ reserved: true, remaining: 400 });
    mocks.generateImage.mockResolvedValue({
      kind: 'image',
      data: Buffer.from('generated').toString('base64'),
      mimeType: 'image/png',
    });
    mocks.completeGrant.mockRejectedValue(new Error('Free generation grant is busy'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get(FREE_GENERATIONS_REMAINING_HEADER)).toBeNull();
    await expect(response.text()).resolves.toBe('generated');
    expect(mocks.failGrant).not.toHaveBeenCalled();
  });
});
