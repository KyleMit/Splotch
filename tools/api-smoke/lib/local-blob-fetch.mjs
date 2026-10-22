// The local Blobs emulator omits read ETags. Preserve its write ETags so the real CAS paths run.
export function localBlobFetch(fetch, origin) {
  const etags = new Map();
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
      throw new Error('The local test API contract cannot call an outside service');
    const response = await fetch(input, { ...init, redirect: 'error' });
    if (url.origin !== origin) return response;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (method === 'DELETE') etags.delete(url.pathname);
    const etag = response.headers.get('etag');
    if (etag && response.ok) etags.set(url.pathname, etag);
    if (method !== 'GET' || !response.ok || etag || !etags.has(url.pathname)) return response;
    const headers = new Headers(response.headers);
    headers.set('etag', etags.get(url.pathname));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
