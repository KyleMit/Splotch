#!/usr/bin/env node
// Self-contained smoke test for the /api/* HTTP contract (see the `api` skill).
// Boots a throwaway `vite dev` with test env, exercises the CORS/preflight
// contract, the admin auth flow, the public oracles, the csp-report receiver,
// and generate-image's auth gate against the documented shapes, then tears the
// server down. No model key or Netlify Blobs needed — every case here is
// answered before any model call: generate-image's are rejected at the auth
// gate and verify-key's at body validation. Anything that would reach OpenAI —
// a successful generation, a real key probe — is out of scope, because a run
// must fail on a contract regression and nothing else.

import { randomUUID } from 'node:crypto';
import { spawnViteServer } from '../lib/vite-server.mjs';
import { waitForUrl } from '../lib/net.mjs';
import { check, fatal, summarize, json } from '../lib/smoke.mjs';
import { adminClient } from './lib/admin-client.mjs';
import { CORS_HEADERS } from './lib/contract-expectations.mjs';
// Type-stripped at runtime (the npm script passes --experimental-strip-types)
// so the absence assertions below name the same headers the hook stamps — a new
// security header is covered here the moment it's added to that module.
import { SECURITY_HEADERS } from '../../web/src/lib/server/securityHeaders.ts';
import { MAX_IMAGE_BYTES } from '../../web/src/lib/server/generateImagePolicy.ts';
import { tinyPngBuffer } from '../../web/tests/fixtures.ts';
import { REPORT_HONEYPOT_FIELD } from '../../web/src/lib/report.ts';

const PORT = Number(process.env.SMOKE_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;
const ADMIN_SECRET = randomUUID();
const SEED_TOKENS = 'alpha,beta';
const OVERSIZED_IMAGE_BYTES = MAX_IMAGE_BYTES + 1;

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

  const { res: noAuth, body: noAuthBody } = await admin.listTokens({});
  check(
    'tokens without auth → 401 {ok:false, error}',
    noAuth.status === 401 && noAuthBody?.ok === false && typeof noAuthBody?.error === 'string',
    `got ${noAuth.status} ${JSON.stringify(noAuthBody)}`
  );

  const { res: badAuth, body: badAuthBody } = await admin.listTokens(authHeader('deadbeef'));
  check(
    'tokens with bad bearer → 401 {ok:false, error}',
    badAuth.status === 401 && badAuthBody?.ok === false && typeof badAuthBody?.error === 'string',
    `got ${badAuth.status} ${JSON.stringify(badAuthBody)}`
  );

  return { auth: authHeader(session), noAuth };
}

// --- CORS contract (hooks.server.ts `handleCors`, ADR-0007) ---
async function checkCorsContract(base, noAuth) {
  // The native WebViews call /api/* from a foreign origin, so the preflight is
  // answered before any route logic and every /api/* response carries the CORS
  // set. Neither may carry the SSR security headers: `handleSecurityHeaders`
  // skips /api, and a preflight short-circuits the handle sequence before it
  // runs at all.
  const wrongCors = (res) =>
    Object.entries(CORS_HEADERS)
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
  // fallback. The hosted deploy contract asserts the opposite —
  // persistent:true — against a real function.
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

  // readJsonBody's uniform malformed-body 400 must carry the same canonical
  // failure shape as every other JSON error.
  const badJson = await fetch(`${BASE}/api/admin/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: 'not json',
  });
  const badJsonBody = await json(badJson);
  check(
    'tokens POST malformed body → 400 {ok:false, error}',
    badJson.status === 400 && badJsonBody?.ok === false && typeof badJsonBody?.error === 'string',
    `got ${badJson.status} ${JSON.stringify(badJsonBody)}`
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

// --- report: validation + honeypot + graceful-unconfigured. GITHUB_ISSUE_TOKEN is
// force-cleared in the server env (see spawnViteServer below), so reporting is always
// unconfigured here and a valid submission gets a 503 — never a real issue. Without
// that clear, a developer's local web/.env token would make the valid case open real
// issues on every run. The burst loop below carries its own payload-level guard. ---
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

  const unconfigured = await report({ kind: 'feature', message: 'A stamps tool please' });
  const unconfiguredBody = await json(unconfigured);
  check(
    'report valid but no GITHUB_ISSUE_TOKEN → 503 {ok:false, error}',
    unconfigured.status === 503 &&
      unconfiguredBody?.ok === false &&
      typeof unconfiguredBody?.error === 'string',
    `got ${unconfigured.status} ${JSON.stringify(unconfiguredBody)}`
  );

  // The honeypot's contract is indistinguishability, not a fixed 200: whatever a
  // real submission gets on this server, a caught bot gets too. Asserting a
  // literal instead is what let the trap answer 200 while a real submitter with
  // the same payload got 503 — an oracle naming the field in one request. So this
  // compares the two rather than either one against a constant, and the shape is
  // therefore whatever the env makes it (503 here, 200 with a token set).
  const honeypot = await report({
    kind: 'feature',
    message: 'A stamps tool please',
    [REPORT_HONEYPOT_FIELD]: 'iam-a-bot',
  });
  const honeypotBody = await json(honeypot);
  check(
    'report with filled honeypot → answered exactly as the same payload without it',
    honeypot.status === unconfigured.status &&
      JSON.stringify(honeypotBody) === JSON.stringify(unconfiguredBody),
    `got ${honeypot.status} ${JSON.stringify(honeypotBody)}, real got ${unconfigured.status} ${JSON.stringify(unconfiguredBody)}`
  );

  // report has its own tighter per-IP bucket (5/min); burst past it. Every burst
  // payload fills the honeypot, so it cannot open an issue on any server under any
  // env — the endpoint charges the bucket before the honeypot short-circuit
  // (pinned by web/src/routes/api/report/server.test.ts), so the 429 still trips.
  // A value distinct from the contract case above keeps the two apart in a log.
  let reportLimited = null;
  for (let i = 0; i < 8 && !reportLimited; i++) {
    const res = await report({
      kind: 'bug',
      message: `burst ${i}`,
      [REPORT_HONEYPOT_FIELD]: 'smoke-burst',
    });
    if (res.status === 429) reportLimited = res;
  }
  check(
    'report throttled → 429 with Retry-After',
    reportLimited !== null && Boolean(reportLimited.headers.get('retry-after')),
    reportLimited ? 'saw 429' : 'never saw a 429'
  );
}

async function checkImageReport(base) {
  const imageReportForm = () => {
    const form = new FormData();
    form.set('drawing', new Blob([tinyPngBuffer()], { type: 'image/png' }), 'drawing.png');
    form.set('output', new Blob([tinyPngBuffer()], { type: 'image/png' }), 'output.png');
    form.set('style', 'Magical');
    return form;
  };
  const response = await fetch(`${base}/api/report-image`, {
    method: 'POST',
    body: imageReportForm(),
  });
  const body = await json(response);
  check(
    'report-image with private reporting unconfigured → 503 {ok:false, error}',
    response.status === 503 && body?.ok === false && typeof body?.error === 'string',
    `got ${response.status} ${JSON.stringify(body)}`
  );

  // The configuration probe short-circuits ahead of authorization, so this
  // harness cannot reach the credential branches — reporting is deliberately
  // unconfigured here. What it does pin is that the free credential is never the
  // thing that fails: were authorization to move ahead of the probe, a
  // report-image missing the free branch would answer 403 here instead (#960).
  const free = await fetch(`${base}/api/report-image`, {
    method: 'POST',
    headers: { 'X-Installation-Id': 'a'.repeat(64) },
    body: imageReportForm(),
  });
  check(
    'report-image with a free installation id → not a credential rejection',
    free.status !== 403,
    `got ${free.status} ${JSON.stringify(await json(free))}`
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
  const badTokenBody = await json(badToken);
  check(
    'generate-image with invalid token → 403 {ok:false, error}',
    badToken.status === 403 &&
      badTokenBody?.ok === false &&
      typeof badTokenBody?.error === 'string',
    `got ${badToken.status} ${JSON.stringify(badTokenBody)}`
  );

  const noImage = await genRequest({ token: 'alpha' });
  const noImageBody = await json(noImage);
  check(
    'generate-image with valid token but no image → 400 {ok:false, error}',
    noImage.status === 400 && noImageBody?.ok === false && typeof noImageBody?.error === 'string',
    `got ${noImage.status} ${JSON.stringify(noImageBody)}`
  );

  const oversizedImage = await genRequest({
    token: 'alpha',
    image: Buffer.alloc(OVERSIZED_IMAGE_BYTES),
  });
  const oversizedImageBody = await json(oversizedImage);
  check(
    'generate-image oversized image → 413 {ok:false, error}',
    oversizedImage.status === 413 &&
      oversizedImageBody?.ok === false &&
      typeof oversizedImageBody?.error === 'string',
    `got ${oversizedImage.status} ${JSON.stringify(oversizedImageBody)}`
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
  const legacyValidTokenBody = await json(legacyValidToken);
  check(
    'generate-image legacy multipart valid token, bad type → 415 {ok:false, error}',
    legacyValidToken.status === 415 &&
      legacyValidTokenBody?.ok === false &&
      typeof legacyValidTokenBody?.error === 'string',
    `got ${legacyValidToken.status} ${JSON.stringify(legacyValidTokenBody)}`
  );
}

async function checkGenerationResult(base) {
  // The collect half of the async flow (ADR-0115). Both cases are reachable
  // without a worker or a model call: the job id is the whole request, so a
  // malformed one and an unknown one are the two shapes a client can actually
  // land on when a picture goes missing.
  const malformed = await fetch(`${base}/api/generation-result?job=not-a-job-id`);
  const malformedBody = await json(malformed);
  check(
    'generation-result malformed job id → 400 {ok:false, error}',
    malformed.status === 400 &&
      malformedBody?.ok === false &&
      typeof malformedBody?.error === 'string',
    `got ${malformed.status} ${JSON.stringify(malformedBody)}`
  );

  // 404 where the job store is reachable and the job simply is not there; 503
  // with GENERATION_UNAVAILABLE where it is not reachable at all, which is this
  // server, since a throwaway vite dev has no Netlify Blobs. The code is the
  // point: it is what tells the client to keep waiting rather than abandon a
  // picture that may be sitting there finished. Neither is the 500 an unguarded
  // store read produced.
  const unknown = await fetch(`${base}/api/generation-result?job=${'b'.repeat(64)}`);
  const unknownBody = await json(unknown);
  check(
    'generation-result unknown job → 404, or 503 GENERATION_UNAVAILABLE, never a 500 crash',
    ((unknown.status === 404 && unknownBody?.code === undefined) ||
      (unknown.status === 503 && unknownBody?.code === 'GENERATION_UNAVAILABLE')) &&
      unknownBody?.ok === false &&
      typeof unknownBody?.error === 'string',
    `got ${unknown.status} ${JSON.stringify(unknownBody)}`
  );
}

async function checkVerifyKey(base) {
  // Only the case the server can answer by itself. A key in the request body is
  // the one the route probes — the server's own env key is not consulted — so
  // any case that reaches the provider makes this suite a live OpenAI
  // integration test: blocked DNS, an outage, or a 429 all produce the correct
  // 503 KEY_CHECK_UNAVAILABLE and fail the run for external state rather than a
  // contract regression. Both provider branches are covered where they can be
  // driven deterministically, in the route's own unit test.
  const empty = await fetch(`${base}/api/verify-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const emptyBody = await json(empty);
  check(
    'verify-key with no key → 400 {ok:false, error}',
    empty.status === 400 && emptyBody?.ok === false && typeof emptyBody?.error === 'string',
    `got ${empty.status} ${JSON.stringify(emptyBody)}`
  );
}

async function checkFreeGenerationGrant(base) {
  const installationId = 'a'.repeat(64);
  const status = await fetch(`${base}/api/free-generation-grant`, {
    headers: { 'X-Installation-Id': installationId },
  });
  const statusBody = await json(status);
  check(
    'free-generation-grant fresh installation → 10 remaining',
    status.status === 200 &&
      statusBody?.ok === true &&
      statusBody?.remaining === 10 &&
      statusBody?.limit === 10,
    `got ${status.status} ${JSON.stringify(statusBody)}`
  );

  const invalidImage = await fetch(`${base}/api/generate-image`, {
    method: 'POST',
    headers: { 'X-Installation-Id': installationId },
  });
  const invalidImageBody = await json(invalidImage);
  check(
    'credential-free generation is authorized before image validation',
    invalidImage.status === 400 && invalidImageBody?.ok === false,
    `got ${invalidImage.status} ${JSON.stringify(invalidImageBody)}`
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
  await checkImageReport(BASE);
  await checkCspReport(BASE);
  await checkGenerateImage(BASE);
  await checkGenerationResult(BASE);
  await checkVerifyKey(BASE);
  await checkFreeGenerationGrant(BASE);
  await checkThrottling(BASE);
}

let stop;
try {
  console.log('Starting test dev server…');
  ({ stop } = spawnViteServer(PORT, {
    // Every private env var the app reads is declared, never inherited from the
    // ambient env or web/.env — a value passed here wins over any .env one, and a
    // name left out is a credential this script's checks would run against for real.
    // tools/tests/e2e-server-env.test.mjs holds this list to the app's reads.
    env: {
      ADMIN_ACCESS_TOKEN: ADMIN_SECRET,
      ALLOWED_TOKENS_LIST: SEED_TOKENS,
      // A key the provider refuses, so the generate-image cases stop at the request
      // guards they are checking without spending anyone's quota. It has to be
      // non-empty: with no key the managed-token path answers 500 from the
      // authorization step and never reaches those guards.
      OPENAI_API_KEY: 'not-a-usable-openai-key',
      // Blank on purpose: the shipped generation deadline is what the contract
      // should be checked against. Only the manual red-team suite raises it.
      GENERATE_DEADLINE_MS_OVERRIDE: '',
      // Reporting stays unconfigured so the report cases assert the graceful 503
      // rather than opening a real GitHub issue.
      GITHUB_ISSUE_TOKEN: '',
      // A repo that does not exist — blank falls back to the real one.
      GITHUB_ISSUE_REPO: 'splotch-tests/nowhere',
      // Non-blank so the free report path fails on the credential it is being
      // checked for, rather than on an unconfigured signing secret.
      REPORT_TOKEN_SECRET: 'smoke-report-token-secret',
      USAGE_GRANT_ID_SECRET: 'smoke-usage-grant-id-secret',
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
