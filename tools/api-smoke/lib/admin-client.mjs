// Shared request plumbing for the admin surface the local and deployed smoke
// contracts drive: the login exchange plus the /api/admin/tokens CRUD calls. Every
// method returns the raw Response alongside the parsed JSON body so the
// assertions stay in the smoke scripts — this module only makes the requests.

import { sleep } from '../../lib/proc.mjs';
import { json } from '../../lib/smoke.mjs';

const LOGIN_ATTEMPTS = 5;
const TOKENS = '/api/admin/tokens';

export function adminClient(base) {
  const request = async (path, { method = 'GET', headers = {}, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { res, body: await json(res) };
  };

  return {
    // `retryOn429` rides through the per-IP rate limiter that guards the login
    // oracle (a re-run within the window can 429) — only the deploy-facing
    // caller needs it.
    async login(secret, { retryOn429 = false } = {}) {
      for (let attempt = 0; attempt < LOGIN_ATTEMPTS; attempt++) {
        const result = await request('/api/admin/login', {
          method: 'POST',
          body: { key: secret },
        });
        if (!retryOn429 || result.res.status !== 429) return result;
        const wait = Number(result.res.headers.get('retry-after') ?? 2);
        console.log(`  … login rate-limited, waiting ${wait}s`);
        await sleep((wait + 1) * 1000);
      }
      throw new Error('login kept hitting the rate limiter');
    },

    listTokens(auth) {
      return request(TOKENS, { headers: auth });
    },

    addToken(auth, token) {
      return request(TOKENS, { method: 'POST', headers: auth, body: { token } });
    },

    delToken(auth, token) {
      return request(TOKENS, { method: 'DELETE', headers: auth, body: { token } });
    },
  };
}
