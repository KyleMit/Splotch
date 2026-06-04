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

test('rejects an oversized upload with 413', async ({ request }) => {
  // 16 MB — just over the 15 MB cap.
  const tooBig = Buffer.alloc(16 * 1024 * 1024);
  const res = await request.post('/api/generate-image', {
    multipart: form(tooBig, 'image/png')
  });
  expect(res.status()).toBe(413);
});

test('rejects an unsupported image type with 415', async ({ request }) => {
  const res = await request.post('/api/generate-image', {
    multipart: form(TINY_PNG, 'image/gif', 'drawing.gif')
  });
  expect(res.status()).toBe(415);
});

test('lets a normal-sized, allowed upload past the guards', async ({ request }) => {
  // The throwaway key means the Gemini call itself fails downstream (≈502), but
  // the point is only that the size/type guards do NOT reject it.
  const res = await request.post('/api/generate-image', {
    multipart: form(TINY_PNG, 'image/png')
  });
  expect(res.status()).not.toBe(413);
  expect(res.status()).not.toBe(415);
});

test('throttles a managed token hammered in a burst', async ({ request }) => {
  // Use a deliberately unsupported type (gif → 415) so each request is rejected
  // *before* the Gemini call — the per-token rate limiter counts the hit first,
  // so we exhaust the window without spending any real quota. BYOK requests are
  // intentionally not throttled, so this only fires on the managed-token path.
  const token = 'daycare-club';
  const statuses = [];
  for (let i = 0; i < GENERATE_LIMIT + 1; i++) {
    const res = await request.post('/api/generate-image', {
      multipart: managedForm(TINY_PNG, 'image/gif', token, 'drawing.gif')
    });
    statuses.push(res.status());
  }

  // Requests within the limit clear the throttle (rejected only by the type
  // guard); the one that tips over the limit gets a 429 with a Retry-After.
  expect(statuses.slice(0, GENERATE_LIMIT)).not.toContain(429);
  const res = await request.post('/api/generate-image', {
    multipart: managedForm(TINY_PNG, 'image/gif', token, 'drawing.gif')
  });
  expect(res.status()).toBe(429);
  expect(res.headers()['retry-after']).toBeTruthy();
});
