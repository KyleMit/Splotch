import { expect, test, type APIRequestContext } from '@playwright/test';

// Server-side guards on /api/generate-image. These hit the endpoint directly
// (no page) because the size/type caps are pure request validation. The
// contract is a raw image body: the credential rides in a header (an `X-Api-Key`
// flips the handler into BYOK mode, which skips the token allowlist; an
// `X-Access-Token` exercises the managed allowlist), the image type is the
// body's Content-Type, and the style enum is a query param. A bad payload is
// rejected *before* any Gemini call, so a throwaway key is fine here.
//
// Every BYOK request from this file shares one per-IP limiter bucket, so the
// tests must run in declaration order (burst test last) — opt this file out of
// the suite's fullyParallel mode.
test.describe.configure({ mode: 'default' });

// 1x1 transparent PNG — a legitimate, tiny, allowed upload.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

// Mirrors of GENERATE_LIMIT / BYOK_LIMIT in src/lib/server/generationAuthorization.ts.
const GENERATE_LIMIT = 15;
const BYOK_LIMIT = 30;

// Raw-body POST to the endpoint. A raw image body (Content-Type: image/*) is not
// a form submission, so SvelteKit's CSRF guard — active in the production build
// the e2e suite serves — ignores it; no Origin spoofing needed. `token` uses the
// managed allowlist (`daycare-club` comes from the .env ALLOWED_TOKENS_LIST vite
// dev loads; no other spec uses managed tokens, so its bucket stays ours),
// `apiKey` takes the BYOK path.
function postImage(
  request: APIRequestContext,
  buffer: Buffer,
  mimeType: string,
  cred: { apiKey?: string; token?: string } = { apiKey: 'byok-test-key' }
) {
  const headers: Record<string, string> = { 'Content-Type': mimeType };
  if (cred.apiKey) headers['X-Api-Key'] = cred.apiKey;
  if (cred.token) headers['X-Access-Token'] = cred.token;
  return request.post('/api/generate-image', { data: buffer, headers });
}

test('rejects an oversized upload with 413', async ({ request }) => {
  // 16 MB — just over the 15 MB cap.
  const tooBig = Buffer.alloc(16 * 1024 * 1024);
  const res = await postImage(request, tooBig, 'image/png');
  expect(res.status()).toBe(413);
});

test('rejects an unsupported image type with 415', async ({ request }) => {
  const res = await postImage(request, TINY_PNG, 'image/gif');
  expect(res.status()).toBe(415);
});

test('lets a normal-sized, allowed upload past the guards', async ({ request }) => {
  // The throwaway key means the Gemini call itself fails downstream (≈502), but
  // the point is only that the size/type guards do NOT reject it.
  const res = await postImage(request, TINY_PNG, 'image/png');
  expect(res.status()).not.toBe(413);
  expect(res.status()).not.toBe(415);
});

test('throttles a managed token hammered in a burst', async ({ request, baseURL }, testInfo) => {
  // Use a deliberately unsupported type (gif → 415) so each request is rejected
  // *before* the Gemini call — the per-token rate limiter counts the hit first,
  // so we exhaust the window without spending any real quota.
  //
  // The limiter window is per token, lasts 60s, and rejected hits don't extend
  // it — so a full window doesn't clear until 60s after the burst. A CI retry
  // (retries: 2) starts inside that still-full window, so it would see the very
  // first request 429 and fail deterministically. Give each attempt its own
  // token (the retry ones are allowlisted alongside daycare-club in test.yml) so
  // every attempt gets a fresh window. Local runs never retry, so testInfo.retry
  // is always 0 there — they only ever need daycare-club.
  const tokens = ['daycare-club', 'daycare-club-retry1', 'daycare-club-retry2'];
  const token = tokens[testInfo.retry] ?? tokens[tokens.length - 1];

  const statuses: number[] = [];
  for (let i = 0; i < GENERATE_LIMIT; i++) {
    const res = await postImage(request, TINY_PNG, 'image/gif', { token });
    statuses.push(res.status());
  }

  // Requests within the limit clear the throttle (rejected only by the type guard).
  //
  // A 403 here means the token is not in ALLOWED_TOKENS_LIST — copy .env.example
  // to .env so the test server has the token available.
  expect(statuses[0], 'token rejected (403) — copy .env.example to .env').not.toBe(403);
  expect(statuses).not.toContain(429);

  // The next request tips over the limit → 429 with a Retry-After.
  const res = await postImage(request, TINY_PNG, 'image/gif', { token });
  expect(res.status()).toBe(429);
  expect(res.headers()['retry-after']).toBeTruthy();
});

test('throttles BYOK requests per IP after a generous burst', async ({ request }) => {
  // Same gif trick as above: the per-IP limiter counts the hit before the type
  // guard rejects, so no Gemini call is spent. Earlier tests in this file used
  // a few BYOK hits from this IP, so the 429 can arrive slightly before the
  // full BYOK_LIMIT — the assertion only requires it within the limit + 1.
  const statuses: number[] = [];
  while (statuses.length < BYOK_LIMIT + 1 && !statuses.includes(429)) {
    const res = await postImage(request, TINY_PNG, 'image/gif');
    statuses.push(res.status());
  }
  expect(statuses).toContain(429);

  const res = await postImage(request, TINY_PNG, 'image/gif');
  expect(res.status()).toBe(429);
  expect(res.headers()['retry-after']).toBeTruthy();
});
