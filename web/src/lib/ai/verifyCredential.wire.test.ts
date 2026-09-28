// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiImageProvider } from '$lib/server/ai/provider';

const { rateLimit, peekRateLimit, verifyKey, isAllowedToken } = vi.hoisted(() => ({
  rateLimit: vi.fn<typeof import('$lib/server/rateLimit').rateLimit>(),
  peekRateLimit: vi.fn<typeof import('$lib/server/rateLimit').peekRateLimit>(),
  verifyKey: vi.fn<AiImageProvider['verifyKey']>(),
  isAllowedToken: vi.fn<typeof import('$lib/server/tokens').isAllowedToken>(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit, peekRateLimit }));
vi.mock('$lib/server/ai/provider', () => ({ aiProvider: { verifyKey } }));
vi.mock('$lib/server/tokens', () => ({ isAllowedToken }));

import { POST as verifyKeyRoute } from '../../routes/api/verify-key/+server';
import { POST as verifyAccessCodeRoute } from '../../routes/api/verify-access-code/+server';
import { verifyCredential } from './verifyCredential';

// Every request the client builds is handed to the real route handler for its
// path, so a body field renamed on one side alone fails here: the client's and
// each route's own tests pin only that side's literals.
function serveVerifyRoutes() {
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    const request = new Request(new URL(input, 'http://localhost'), init);
    const event = { request, getClientAddress: () => '203.0.113.9' };
    const { pathname } = new URL(request.url);
    if (pathname === '/api/verify-key') {
      return verifyKeyRoute(event as unknown as Parameters<typeof verifyKeyRoute>[0]);
    }
    if (pathname === '/api/verify-access-code') {
      return verifyAccessCodeRoute(event as unknown as Parameters<typeof verifyAccessCodeRoute>[0]);
    }
    throw new Error(`No verify route at ${pathname}`);
  });
}

beforeEach(() => {
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  peekRateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  verifyKey.mockReset().mockResolvedValue({ ok: true });
  isAllowedToken.mockReset().mockResolvedValue(true);
  serveVerifyRoutes();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('credential verification over the wire', () => {
  it('delivers a typed API key to the provider check', async () => {
    expect(await verifyCredential('sk-proj-ExampleKey1234')).toEqual({ ok: true, kind: 'apiKey' });
    expect(verifyKey).toHaveBeenCalledWith('sk-proj-ExampleKey1234');
  });

  it('delivers a typed access code to the allowlist and stores what the server echoes', async () => {
    expect(await verifyCredential('sunny-meadow')).toEqual({
      ok: true,
      kind: 'accessCode',
      accessCode: 'sunny-meadow',
    });
    expect(isAllowedToken).toHaveBeenCalledWith('sunny-meadow');
  });
});
