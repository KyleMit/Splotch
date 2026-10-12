// Every non-OPTIONS /api/* response carries Cache-Control: no-store, the default
// web/src/hooks.server.ts's handleApiCaching sets; a route replaces it only with a
// policy docs/API.md documents. Recording at the fetch boundary holds every
// response a check receives through fetch to that, whichever check made the
// request, so a new check is covered without asserting it again. The OPTIONS
// preflight is cached through Access-Control-Max-Age instead and never reaches
// the hook. Two local-smoke requests sit outside the recorder: the readiness
// probe, sent before the server is known to answer through its hooks and
// repeated by the admin-auth check once it does, and the chunked request sent
// through node:http, which asserts its own no-store.

import { check } from '../../lib/smoke.mjs';

const hasNoStore = (response) =>
  (response.headers.get('cache-control') ?? '')
    .split(',')
    .some((directive) => directive.trim().toLowerCase() === 'no-store');

/** Starts recording; call the returned function once the run's requests are done. */
export function recordApiCaching() {
  const cacheable = [];
  const unrecordedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await unrecordedFetch(input, init);
    const method = init?.method ?? 'GET';
    const { pathname } = new URL(input);
    if (method !== 'OPTIONS' && pathname.startsWith('/api/') && !hasNoStore(response)) {
      const cacheControl = JSON.stringify(response.headers.get('cache-control'));
      cacheable.push(`${method} ${pathname} → ${response.status} Cache-Control=${cacheControl}`);
    }
    return response;
  };

  return () =>
    check(
      'every non-OPTIONS /api/* response → Cache-Control: no-store',
      cacheable.length === 0,
      cacheable.join('; ')
    );
}
