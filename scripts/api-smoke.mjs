#!/usr/bin/env node
// Self-contained smoke test for the /api/* HTTP contract (see the `api` skill).
// Boots a throwaway `vite dev` with test env, exercises the CORS/preflight
// contract, the admin auth flow, the public oracles, the csp-report receiver,
// and generate-image's auth gate against the documented shapes, then tears the
// server down. No Gemini key or Netlify Blobs needed — every
// generate-image case here is rejected before the model call; successful
// generation and verify-key (which make live model calls) are out of scope.

import { randomUUID } from 'node:crypto';
import { spawnViteServer } from './lib/vite-server.mjs';
import { waitForUrl } from './lib/net.mjs';
import { check, fatal, summarize, json } from './lib/smoke.mjs';
import { adminClient } from './lib/adminClient.mjs';
// Type-stripped at runtime (the npm script passes --experimental-strip-types)
// so the absence assertions below name the same headers the hook stamps — a new
// security header is covered here the moment it's added to that module.
import { SECURITY_HEADERS } from '../web/src/lib/server/securityHeaders.ts';
import { tinyPngBuffer } from '../web/tests/fixtures.ts';

const PORT = Number(process.env.SMOKE_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;
const ADMIN_SECRET = randomUUID();
const SEED_TOKENS = 'alpha,beta';

const postJson = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const authHeader = (session) => ({ Authorization: `Bearer ${session}` });

// Returns the admin `auth` header plus the unauthenticated /api/* response, which
// the CORS suite re-reads instead of spending another request.
async function checkAdminAuth(admin) {
  const { res: wrong, body: wrongBody } = await admin.login('definitely-wrong');
  check(
    'login with wrong key → 403 {ok:false}',
    wrong.status === 403 && wrongBody?.ok === false,
    `got ${wrong.status}`
  );

  const { res: good, body: goodBody } = await admin.login(ADMIN_SECRET);
  const session = goodBody?.session;
  check(
    'login with correct key → 200 {ok:true, session:<64-hex>}',
    good.status === 200 && goodBody?.ok === true && /^[a-f0-9]{64}$/.test(session ?? ''),
    `got ${good.status}`
  );

  const { res: noAuth } = await admin.listTokens({});
  check('tokens without auth → 401', noAuth.status === 401, `got ${noAuth.status}`);

  const { res: badAuth } = await admin.listTokens(authHeader('deadbeef'));
  check('tokens with bad bearer → 401', badAuth.status === 401, `got ${badAuth.status}`);

  return { auth: authHeader(session), noAuth };
}

// --- CORS contract (hooks.server.ts `handleCors`, ADR-0007) ---
async function checkCorsContract(base, noAuth) {
  // The native WebViews call /api/* from a foreign origin, so the preflight is
  // answered before any route logic and every /api/* response carries the CORS
  // set. Neither may carry the SSR security headers: `handleSecurityHeaders`
  // skips /api, and a preflight short-circuits the handle sequence before it
  // runs at all.
  const CORS_SET = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Access-Token, X-Api-Key',
    'access-control-max-age': '86400',
  };
  const wrongCors = (res) =>
    Object.entries(CORS_SET)
      .filter(([name, value]) => res.headers.get(name) !== value)
      .map(([name]) => `${name}: ${res.headers.get(name)}`);
  const leakedSecurity = (res) => Object.keys(SECURITY_HEADERS).filter((h) => res.headers.has(h));

  // OPTIONS returns before `resolve()`, so this spends no rate-limit budget —
  // which is what lets it sit ahead of the burst checks further down.
  const preflight = await fetch(`${base}/api/generate-image`, { method: 'OPTIONS' });
  check(
    'OPTIONS /api/* → 204 with the CORS set and no security headers',
    preflight.status === 204 &&
      wrongCors(preflight).length === 0 &&
      leakedSecurity(preflight).length === 0,
    `got ${preflight.status}, wrong ${JSON.stringify(wrongCors(preflight))}, leaked ${JSON.stringify(leakedSecurity(preflight))}`
  );

  // Reuses the 401 above rather than spending a request: the headers are
  // stamped after `resolve()`, so every /api/* response carries them whatever
  // its status.
  check(
    'non-OPTIONS /api/* → CORS set stamped, no security headers',
    wrongCors(noAuth).length === 0 && leakedSecurity(noAuth).length === 0,
    `wrong ${JSON.stringify(wrongCors(noAuth))}, leaked ${JSON.stringify(leakedSecurity(noAuth))}`
  );
}

async function checkTokensCrud(admin, auth) {
  const { res: list, body: listBody } = await admin.listTokens(auth);
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
  const { res: add, body: addBody } = await admin.addToken(auth, newToken);
  check(
    'tokens POST adds a token',
    add.status === 200 && addBody?.tokens?.includes(newToken),
    `got ${add.status}`
  );

  const { res: del, body: delBody } = await admin.delToken(auth, newToken);
  check(
    'tokens DELETE removes the token',
    del.status === 200 && !delBody?.tokens?.includes(newToken),
    `got ${del.status}`
  );
}

// --- public oracle: verify-access-code against the seeded allowlist ---
async function checkVerifyAccessCode(base) {
  const code = await postJson(base, '/api/verify-access-code', {
    code: 'almost-certainly-not-a-real-code',
  });
  const codeBody = await json(code);
  check(
    'verify-access-code invalid → 200 {ok:false, error}',
    code.status === 200 && codeBody?.ok === false && typeof codeBody?.error === 'string',
    `got ${code.status} ${JSON.stringify(codeBody)}`
  );

  const goodCode = await postJson(base, '/api/verify-access-code', { code: 'alpha' });
  const goodCodeBody = await json(goodCode);
  check(
    'verify-access-code valid → 200 {ok:true, accessCode}',
    goodCode.status === 200 && goodCodeBody?.ok === true && goodCodeBody?.accessCode === 'alpha',
    `got ${goodCode.status} ${JSON.stringify(goodCodeBody)}`
  );
}

// --- report: validation + honeypot + graceful-unconfigured (no GITHUB token
// in the smoke env, so no real issue is ever created) ---
async function checkReport(base) {
  const report = (payload) => postJson(base, '/api/report', payload);

  const emptyReport = await report({ kind: 'bug', message: '   ' });
  const emptyReportBody = await json(emptyReport);
  check(
    'report empty message → 400 {ok:false, error}',
    emptyReport.status === 400 &&
      emptyReportBody?.ok === false &&
      typeof emptyReportBody?.error === 'string',
    `got ${emptyReport.status} ${JSON.stringify(emptyReportBody)}`
  );

  const badKind = await report({ kind: 'nope', message: 'hi' });
  check('report invalid kind → 400', badKind.status === 400, `got ${badKind.status}`);

  const honeypot = await report({ kind: 'bug', message: 'spam', hp: 'iam-a-bot' });
  const honeypotBody = await json(honeypot);
  check(
    'report with filled honeypot → 200 {ok:true} and no issue',
    honeypot.status === 200 && honeypotBody?.ok === true && honeypotBody?.url === undefined,
    `got ${honeypot.status} ${JSON.stringify(honeypotBody)}`
  );

  const unconfigured = await report({ kind: 'feature', message: 'A stamps tool please' });
  const unconfiguredBody = await json(unconfigured);
  check(
    'report valid but no GITHUB_ISSUE_TOKEN → 503 {ok:false, error}',
    unconfigured.status === 503 &&
      unconfiguredBody?.ok === false &&
      typeof unconfiguredBody?.error === 'string',
    `got ${unconfigured.status} ${JSON.stringify(unconfiguredBody)}`
  );

  // report has its own tighter per-IP bucket (5/min); burst past it.
  let reportLimited = null;
  for (let i = 0; i < 8 && !reportLimited; i++) {
    const res = await report({ kind: 'bug', message: `burst ${i}` });
    if (res.status === 429) reportLimited = res;
  }
  check(
    'report throttled → 429 with Retry-After',
    reportLimited !== null && Boolean(reportLimited.headers.get('retry-after')),
    reportLimited ? 'saw 429' : 'never saw a 429'
  );
}

// --- csp-report: both browser payload formats, caps, and its own bucket ---
async function checkCspReport(base) {
  const cspReport = (body, contentType) =>
    fetch(`${base}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });

  const reportUriPayload = JSON.stringify({
    'csp-report': {
      'document-uri': `${base}/`,
      'blocked-uri': 'https://evil.example/x.js',
      'effective-directive': 'script-src',
      disposition: 'enforce',
    },
  });
  const legacyFormat = await cspReport(reportUriPayload, 'application/csp-report');
  check(
    'csp-report report-uri payload → 204',
    legacyFormat.status === 204,
    `got ${legacyFormat.status}`
  );

  const reportingApiPayload = JSON.stringify([
    {
      type: 'csp-violation',
      url: `${base}/`,
      body: { documentURL: `${base}/`, blockedURL: 'inline', effectiveDirective: 'style-src-attr' },
    },
  ]);
  const modernFormat = await cspReport(reportingApiPayload, 'application/reports+json');
  check(
    'csp-report Reporting-API payload → 204',
    modernFormat.status === 204,
    `got ${modernFormat.status}`
  );

  const wrongType = await cspReport(reportUriPayload, 'text/plain');
  check(
    'csp-report non-report content type → 415',
    wrongType.status === 415,
    `got ${wrongType.status}`
  );

  const oversize = await cspReport(
    JSON.stringify({ 'csp-report': { 'blocked-uri': 'x'.repeat(40 * 1024) } }),
    'application/csp-report'
  );
  check('csp-report oversize body → 413', oversize.status === 413, `got ${oversize.status}`);

  const garbage = await cspReport('not json at all', 'application/csp-report');
  check(
    'csp-report malformed JSON → dropped with 204',
    garbage.status === 204,
    `got ${garbage.status}`
  );

  // csp-report has its own per-IP bucket (10/min); the five hits above count.
  let cspLimited = null;
  for (let i = 0; i < 8 && !cspLimited; i++) {
    const res = await cspReport(reportUriPayload, 'application/csp-report');
    if (res.status === 429) cspLimited = res;
  }
  check(
    'csp-report throttled → 429 with Retry-After',
    cspLimited !== null && Boolean(cspLimited.headers.get('retry-after')),
    cspLimited ? 'saw 429' : 'never saw a 429'
  );
}

// --- generate-image auth gate (every case rejected before the model call) ---
async function checkGenerateImage(base) {
  // The contract is a raw image body: credentials ride in headers (secrets stay
  // out of the query string), the style enum is a query param, the body is the
  // image bytes. `image: null` sends no body — the valid-token-but-no-image case.
  const genRequest = ({ token, apiKey, image } = {}) => {
    const headers = {};
    if (token) headers['X-Access-Token'] = token;
    if (apiKey) headers['X-Api-Key'] = apiKey;
    if (image) headers['Content-Type'] = 'image/png';
    return fetch(`${base}/api/generate-image`, {
      method: 'POST',
      headers,
      body: image ?? undefined,
    });
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

  // Legacy multipart contract (token/apiKey/image/style form fields) — still
  // accepted so shipped native builds and stale-service-worker PWA clients keep
  // working across the raw-body switch (ADR-0064). Reads the credential from the
  // form field: a valid token + gif reaches the type guard (415), an invalid one
  // is rejected at the auth gate (403) — both prove the field was parsed.
  const legacyMultipart = ({ token, mimeType }) => {
    const form = new FormData();
    if (token) form.set('token', token);
    form.set('image', new Blob([tinyPngBuffer()], { type: mimeType }), 'drawing');
    return fetch(`${base}/api/generate-image`, { method: 'POST', body: form });
  };

  const legacyBadToken = await legacyMultipart({
    token: 'not-a-real-token',
    mimeType: 'image/png',
  });
  check(
    'generate-image legacy multipart invalid token → 403',
    legacyBadToken.status === 403,
    `got ${legacyBadToken.status}`
  );

  const legacyValidToken = await legacyMultipart({ token: 'alpha', mimeType: 'image/gif' });
  check(
    'generate-image legacy multipart valid token, bad type → 415',
    legacyValidToken.status === 415,
    `got ${legacyValidToken.status}`
  );
}

// --- standard 429 contract (throttled() in src/lib/server/http.ts) ---
async function checkThrottling(base) {
  // The per-IP limit is 10/min; burst past it and assert the shared shape:
  // JSON {ok:false, error} plus a Retry-After header.
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) {
    const res = await postJson(base, '/api/verify-access-code', { code: 'burst-to-the-limit' });
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
  const throttledGuess = await fetch(`${base}/api/generate-image`, {
    method: 'POST',
    headers: { 'X-Access-Token': 'another-bad-guess' },
  });
  const throttledGuessBody = await json(throttledGuess);
  check(
    'generate-image invalid token while limited → shared 429',
    throttledGuess.status === 429 &&
      throttledGuessBody?.ok === false &&
      Boolean(throttledGuess.headers.get('retry-after')),
    `got ${throttledGuess.status}`
  );
}

// The per-route rate-limit buckets make this order load-bearing: each burst
// spends its own bucket, and checkThrottling must run last so the closing
// generate-image guess lands on an already-exhausted shared per-IP budget.
async function run() {
  const admin = adminClient(BASE);
  const { auth, noAuth } = await checkAdminAuth(admin);
  await checkCorsContract(BASE, noAuth);
  await checkTokensCrud(admin, auth);
  await checkVerifyAccessCode(BASE);
  await checkReport(BASE);
  await checkCspReport(BASE);
  await checkGenerateImage(BASE);
  await checkThrottling(BASE);
}

let stop;
try {
  console.log('Starting test dev server…');
  ({ stop } = spawnViteServer(PORT, {
    env: {
      ADMIN_ACCESS_TOKEN: ADMIN_SECRET,
      ALLOWED_TOKENS_LIST: SEED_TOKENS,
      GITHUB_ISSUE_TOKEN: '',
    },
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
