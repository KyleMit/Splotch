// Requests to the /api paths added since the move from SvelteKit, which SvelteKit never served.
// tests/wire-diff.test.mjs records the function's own answers to them in
// fixtures/wire-additions.json, so each stays as it first shipped.
import { ADMIN_SECRET, IOS_ORIGIN, UNTRUSTED_ORIGIN, jsonBody as json } from './wire-cases.mjs';

export const ADDED_API_PATHS = ['/api/admin/stats'];

// The requests to ADDED_API_PATHS, with their own client addresses so none spends a budget the
// recorded corpus spends. Each opens with its own sign-in for the bearer cases.
export function addedWireCases() {
  let address = 0;
  const ip = () => `192.0.2.${++address}`;
  const session = '__ADMIN_SESSION__';
  const cases = [
    ...ADDED_API_PATHS.map((path) => ({ name: `OPTIONS ${path}`, method: 'OPTIONS', path })),
    ...ADDED_API_PATHS.map((path) => ({
      name: `OPTIONS ${path} from the iOS WebView`,
      method: 'OPTIONS',
      path,
      headers: {
        origin: IOS_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    })),
    {
      name: 'admin login, right key',
      method: 'POST',
      path: '/api/admin/login',
      ...json({ key: ADMIN_SECRET }),
    },
    { name: 'stats, no auth', method: 'GET', path: '/api/admin/stats' },
    {
      name: 'stats, bad bearer',
      method: 'GET',
      path: '/api/admin/stats',
      headers: { authorization: 'Bearer deadbeef' },
    },
    {
      name: 'stats, read',
      method: 'GET',
      path: '/api/admin/stats',
      headers: { authorization: `Bearer ${session}` },
    },
    {
      name: 'stats, trailing slash',
      method: 'GET',
      path: '/api/admin/stats/',
      headers: { authorization: `Bearer ${session}` },
    },
    {
      name: 'stats, POST',
      method: 'POST',
      path: '/api/admin/stats',
      headers: { authorization: `Bearer ${session}`, 'content-type': 'application/json' },
      body: '{}',
    },
    {
      name: 'stats, cross-site text/plain form post',
      method: 'POST',
      path: '/api/admin/stats',
      headers: { origin: UNTRUSTED_ORIGIN, 'content-type': 'text/plain' },
      body: '{}',
    },
  ];
  return cases.map((testCase) => ({ ...testCase, ip: ip() }));
}
