#!/usr/bin/env node
// Self-contained smoke test for the /api/* HTTP contract (see the `api` skill).
// Boots a throwaway `vite dev` with test env, exercises the admin auth flow, the
// public oracles, and generate-image's auth gate against the documented shapes,
// then tears the server down. No Gemini key or Netlify Blobs needed — every
// generate-image case here is rejected before the model call; successful
// generation and verify-key (which make live model calls) are out of scope.

import { randomUUID } from 'node:crypto';
import { spawnViteServer } from './lib/vite-server.mjs';
import { waitForUrl } from './lib/utils.mjs';
import { check, fatal, summarize, json } from './lib/smoke.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;
const ADMIN_SECRET = randomUUID();
const SEED_TOKENS = 'alpha,beta';

async function run() {
  // --- admin/login ---
  const wrong = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'definitely-wrong' }),
  });
  const wrongBody = await json(wrong);
  check(
    'login with wrong key → 403 {ok:false}',
    wrong.status === 403 && wrongBody?.ok === false,
    `got ${wrong.status}`
  );

  const good = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: ADMIN_SECRET }),
  });
  const goodBody = await json(good);
  const session = goodBody?.session;
  check(
    'login with correct key → 200 {ok:true, session:<64-hex>}',
    good.status === 200 && goodBody?.ok === true && /^[a-f0-9]{64}$/.test(session ?? ''),
    `got ${good.status}`
  );

  const auth = { Authorization: `Bearer ${session}` };

  // --- admin/tokens auth gate ---
  const noAuth = await fetch(`${BASE}/api/admin/tokens`);
  check('tokens without auth → 401', noAuth.status === 401, `got ${noAuth.status}`);

  const badAuth = await fetch(`${BASE}/api/admin/tokens`, {
    headers: { Authorization: 'Bearer deadbeef' },
  });
  check('tokens with bad bearer → 401', badAuth.status === 401, `got ${badAuth.status}`);

  // --- tokens snapshot + mutations ---
  const list = await fetch(`${BASE}/api/admin/tokens`, { headers: auth });
  const listBody = await json(list);
  check(
    'tokens GET → 200 {ok, tokens[], invites[]}',
    list.status === 200 &&
      listBody?.ok === true &&
      Array.isArray(listBody?.tokens) &&
      Array.isArray(listBody?.invites),
    `got ${list.status}`
  );
  // vite dev has no Netlify Blobs, so the snapshot must report the in-memory
  // fallback. The deployed counterpart (scripts/blobs-smoke.mjs) asserts the
  // opposite — persistent:true — against a real function.
  check(
    'tokens GET → persistent:false under vite dev',
    listBody?.persistent === false,
    `got ${listBody?.persistent}`
  );

  const newToken = `smoke-${Date.now()}`;
  const add = await fetch(`${BASE}/api/admin/tokens`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: newToken }),
  });
  const addBody = await json(add);
  check(
    'tokens POST adds a token',
    add.status === 200 && addBody?.tokens?.includes(newToken),
    `got ${add.status}`
  );

  const del = await fetch(`${BASE}/api/admin/tokens`, {
    method: 'DELETE',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: newToken }),
  });
  const delBody = await json(del);
  check(
    'tokens DELETE removes the token',
    del.status === 200 && !delBody?.tokens?.includes(newToken),
    `got ${del.status}`
  );

  // --- public oracle: verify-access-code against the seeded allowlist ---
  const code = await fetch(`${BASE}/api/verify-access-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'almost-certainly-not-a-real-code' }),
  });
  const codeBody = await json(code);
  check(
    'verify-access-code invalid → 200 {ok:false, error}',
    code.status === 200 && codeBody?.ok === false && typeof codeBody?.error === 'string',
    `got ${code.status} ${JSON.stringify(codeBody)}`
  );

  const goodCode = await fetch(`${BASE}/api/verify-access-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'alpha' }),
  });
  const goodCodeBody = await json(goodCode);
  check(
    'verify-access-code valid → 200 {ok:true, accessCode}',
    goodCode.status === 200 && goodCodeBody?.ok === true && goodCodeBody?.accessCode === 'alpha',
    `got ${goodCode.status} ${JSON.stringify(goodCodeBody)}`
  );

  // --- generate-image auth gate (every case rejected before the model call) ---
  const genRequest = (fields) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return fetch(`${BASE}/api/generate-image`, { method: 'POST', body: form });
  };

  const badToken = await genRequest({ token: 'not-a-real-token' });
  check(
    'generate-image with invalid token → 403',
    badToken.status === 403,
    `got ${badToken.status}`
  );

  const noImage = await genRequest({ token: 'alpha' });
  check(
    'generate-image with valid token but no image → 400',
    noImage.status === 400,
    `got ${noImage.status}`
  );

  // --- standard 429 contract (throttled() in src/lib/server/http.ts) ---
  // The per-IP limit is 10/min; burst past it and assert the shared shape:
  // JSON {ok:false, error} plus a Retry-After header.
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) {
    const res = await fetch(`${BASE}/api/verify-access-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'burst-to-the-limit' }),
    });
    if (res.status === 429) limited = res;
  }
  const limitedBody = limited ? await json(limited) : null;
  check(
    'throttled → 429 {ok:false, error} with Retry-After',
    limited !== null &&
      limitedBody?.ok === false &&
      typeof limitedBody?.error === 'string' &&
      Boolean(limited.headers.get('retry-after')),
    limited ? `body ${JSON.stringify(limitedBody)}` : 'never saw a 429'
  );

  // Invalid-token guesses at generate-image draw on the same per-IP bucket the
  // burst above just exhausted, so the token oracle must answer 429, not 403.
  const throttledGuess = await genRequest({ token: 'another-bad-guess' });
  const throttledGuessBody = await json(throttledGuess);
  check(
    'generate-image invalid token while limited → shared 429',
    throttledGuess.status === 429 &&
      throttledGuessBody?.ok === false &&
      Boolean(throttledGuess.headers.get('retry-after')),
    `got ${throttledGuess.status}`
  );
}

let stop;
try {
  console.log('Starting test dev server…');
  ({ stop } = spawnViteServer(PORT, {
    ADMIN_ACCESS_TOKEN: ADMIN_SECRET,
    ALLOWED_TOKENS_LIST: SEED_TOKENS,
  }));

  await waitForUrl(`${BASE}/api/admin/tokens`, 45_000, (res) => res.status === 401);
  console.log(`Server ready on ${BASE}\n`);
  await run();
} catch (err) {
  fatal(err);
} finally {
  if (stop) stop();
}

summarize();
