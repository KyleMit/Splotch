// @vitest-environment node
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ building: false, dev: false }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
// SvelteKit's own sequence needs the request store only its runtime sets up.
// This one chains the same handlers in the same order.
vi.mock('@sveltejs/kit/hooks', () => ({
  sequence:
    (...handlers: Handle[]): Handle =>
    ({ event, resolve }) =>
      handlers.reduceRight<Parameters<Handle>[0]['resolve']>(
        (next, handler) => (nextEvent) => handler({ event: nextEvent, resolve: next }),
        resolve
      )(event),
}));

import { handle, handleError } from './hooks.server';

function serve(pathname: string, method = 'GET', routeHeaders: HeadersInit = {}) {
  const url = new URL(pathname, 'https://splotch.test');
  const event = { url, request: new Request(url, { method }) } as unknown as RequestEvent;
  return handle({
    event,
    resolve: async () => Response.json({ ok: true }, { headers: routeHeaders }),
  });
}

describe('the /api cache default', () => {
  // GET /api/admin/tokens answers with every live access code, and no route of
  // its own asks for no-store.
  it('keeps an /api response out of every cache when its route says nothing', async () => {
    const response = await serve('/api/admin/tokens');

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it("leaves a route's own caching decision alone", async () => {
    const response = await serve('/api/example', 'GET', { 'Cache-Control': 'public, max-age=60' });

    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('leaves the preflight to Access-Control-Max-Age', async () => {
    const response = await serve('/api/generate-image', 'OPTIONS');

    expect(response.status).toBe(204);
    expect(response.headers.has('cache-control')).toBe(false);
  });

  it('leaves a page to set its own policy', async () => {
    const response = await serve('/admin');

    expect(response.headers.has('cache-control')).toBe(false);
  });
});

describe('handleError', () => {
  it('logs an unexpected failure without the installation id it quotes', async () => {
    const installationId = 'f'.repeat(64);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleError({
      error: new Error(`free-generation-grants get ${installationId} failed`),
      event: { url: new URL('https://splotch.test/admin') } as unknown as RequestEvent,
      status: 500,
      message: 'Internal Error',
    });

    const line = logged.mock.calls.flat().map(String).join(' ');
    expect(line).toContain('free-generation-grants get <redacted id> failed');
    expect(line).not.toContain(installationId);
    logged.mockRestore();
  });
});
