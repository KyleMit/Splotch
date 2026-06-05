import { expect, test } from '@playwright/test';

// Server-side guards on /api/generate-image. These hit the endpoint directly
// (no page) because the size/type caps are pure request validation. Passing an
// `apiKey` flips the handler into BYOK mode, which skips the token allowlist and
// lets us reach the guards without a real access token. A bad payload is
// rejected *before* any Gemini call, so a throwaway key is fine here.

// 1x1 transparent PNG — a legitimate, tiny, allowed upload.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function form(buffer, mimeType, fileName = 'drawing.png') {
  return {
    apiKey: 'byok-test-key', // BYOK path → skips the token allowlist
    image: { name: fileName, mimeType, buffer }
  };
}

// Managed-token variant (no apiKey) → exercises the allowlist + per-token rate
// limit. `daycare-club` comes from the .env ALLOWED_TOKENS_LIST that vite dev
// loads; no other spec uses managed tokens, so its limiter bucket stays ours.
function managedForm(buffer, mimeType, token, fileName = 'drawing.png') {
  return {
    token,
    image: { name: fileName, mimeType, buffer }
  };
}

// Mirror of GENERATE_LIMIT in src/routes/api/generate-image/+server.js.
const GENERATE_LIMIT = 15;

// The e2e suite runs against the production build, where SvelteKit's CSRF guard
// is active (it's skipped only in `vite dev`). A multipart POST is a form
// submission, so the guard 403s it unless the Origin matches the site — which
// the real app's same-origin fetch always sends. Mirror that here so these
// requests reach the size/type/rate guards under test instead of the CSRF wall.
function postImage(request, baseURL, multipart) {
  return request.post('/api/generate-image', {
    multipart,
    headers: { origin: baseURL }
  });
}

test('rejects an oversized upload with 413', async ({ request, baseURL }) => {
  // 16 MB — just over the 15 MB cap.
  const tooBig = Buffer.alloc(16 * 1024 * 1024);
  const res = await postImage(request, baseURL, form(tooBig, 'image/png'));
  expect(res.status()).toBe(413);
});

test('rejects an unsupported image type with 415', async ({ request, baseURL }) => {
  const res = await postImage(request, baseURL, form(TINY_PNG, 'image/gif', 'drawing.gif'));
  expect(res.status()).toBe(415);
});

test('lets a normal-sized, allowed upload past the guards', async ({ request, baseURL }) => {
  // The throwaway key means the Gemini call itself fails downstream (≈502), but
  // the point is only that the size/type guards do NOT reject it.
  const res = await postImage(request, baseURL, form(TINY_PNG, 'image/png'));
  expect(res.status()).not.toBe(413);
  expect(res.status()).not.toBe(415);
});

test('throttles a managed token hammered in a burst', async ({ request, baseURL }) => {
  // Use a deliberately unsupported type (gif → 415) so each request is rejected
  // *before* the Gemini call — the per-token rate limiter counts the hit first,
  // so we exhaust the window without spending any real quota. BYOK requests are
  // intentionally not throttled, so this only fires on the managed-token path.
  const token = 'daycare-club';
  const statuses = [];
  for (let i = 0; i < GENERATE_LIMIT + 1; i++) {
    const res = await postImage(request, baseURL, managedForm(TINY_PNG, 'image/gif', token, 'drawing.gif'));
    statuses.push(res.status());
  }

  // Requests within the limit clear the throttle (rejected only by the type
  // guard); the one that tips over the limit gets a 429 with a Retry-After.
  expect(statuses.slice(0, GENERATE_LIMIT)).not.toContain(429);
  const res = await postImage(request, baseURL, managedForm(TINY_PNG, 'image/gif', token, 'drawing.gif'));
  expect(res.status()).toBe(429);
  expect(res.headers()['retry-after']).toBeTruthy();
});
