import { afterEach, describe, expect, it, vi } from 'vitest';
import { serveAdminWithoutCaching } from './adminRoute';

afterEach(() => vi.unstubAllGlobals());

function stubCaches(names: string[]) {
  const deletes = new Map<string, ReturnType<typeof vi.fn>>();
  const open = vi.fn(async (name: string) => {
    const del = deletes.get(name) ?? vi.fn(async () => true);
    deletes.set(name, del);
    return { delete: del };
  });
  vi.stubGlobal('caches', { keys: vi.fn(async () => names), open });
  return deletes;
}

const ADMIN_REQUEST = 'https://splotch.art/admin';

describe('admin service-worker route', () => {
  it('answers from the network and never writes the document to a cache', async () => {
    stubCaches([]);
    const network = new Response('admin');
    const fetchMock = vi.fn(async () => network);
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request(ADMIN_REQUEST);

    await expect(serveAdminWithoutCaching({ request })).resolves.toBe(network);
    expect(fetchMock).toHaveBeenCalledWith(request);
  });

  it('evicts the document from every cache an earlier build may have written it to', async () => {
    const deletes = stubCaches(['workbox-runtime-pages', 'workbox-precache-v2']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('admin'))
    );
    const request = new Request(ADMIN_REQUEST);

    await serveAdminWithoutCaching({ request });

    expect([...deletes.keys()]).toEqual(['workbox-runtime-pages', 'workbox-precache-v2']);
    for (const del of deletes.values()) {
      expect(del).toHaveBeenCalledWith(request, { ignoreSearch: true });
    }
  });

  // Workbox inlines a handler by stringifying it, so a body that closed over an
  // import would throw at runtime in the generated service worker.
  it('remains self-contained when Workbox serializes it', async () => {
    const serialized = Function(`return (${serveAdminWithoutCaching.toString()})`)() as (input: {
      request: Request;
    }) => Promise<Response>;
    const deletes = stubCaches(['workbox-runtime-pages']);
    const network = new Response('admin');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => network)
    );

    await expect(serialized({ request: new Request(ADMIN_REQUEST) })).resolves.toBe(network);
    expect(deletes.get('workbox-runtime-pages')).toHaveBeenCalled();
  });
});
