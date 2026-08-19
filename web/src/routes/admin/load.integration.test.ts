// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

vi.mock('$lib/server/tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/tokens')>()),
  getTokensStatus: vi.fn(),
}));
vi.mock('$lib/server/usage', () => ({ getUsage: vi.fn() }));
vi.mock('$lib/server/freeGenerationGrants', () => ({
  getFreeGenerationGrantAdminStats: vi.fn().mockResolvedValue(null),
}));

import { sessionToken } from '$lib/server/admin';
import { getTokensStatus } from '$lib/server/tokens';
import { getUsage } from '$lib/server/usage';
import { load } from './+page.server';

const SECRET = 'the-raw-secret';

beforeEach(() => {
  envState.ADMIN_ACCESS_TOKEN = SECRET;
  vi.mocked(getTokensStatus).mockResolvedValue({ tokens: ['managed-code'], persistent: true });
});

describe('the /admin loader usage state', () => {
  it('surfaces an unavailable usage snapshot instead of saying the code was never used', async () => {
    vi.mocked(getUsage).mockResolvedValue(null);

    const data = await load({
      cookies: { get: () => sessionToken(), set: vi.fn() },
      url: new URL('https://splotch.art/admin'),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toMatchObject({
      invites: [{ token: 'managed-code', usage: undefined }],
    });
  });

  it('still represents an available snapshot without a tally as never used', async () => {
    vi.mocked(getUsage).mockResolvedValue({});

    const data = await load({
      cookies: { get: () => sessionToken(), set: vi.fn() },
      url: new URL('https://splotch.art/admin'),
    } as unknown as Parameters<typeof load>[0]);

    expect(data).toMatchObject({
      invites: [{ token: 'managed-code', usage: null }],
    });
  });
});
