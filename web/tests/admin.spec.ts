import { expect, test, type Page } from '@playwright/test';
import { SECURITY_HEADERS } from '../src/lib/server/securityHeaders';
import { adminConsole, ADMIN_ACCESS_TOKEN, signInToAdmin, submitAdminKey } from './admin-helpers';

// The admin console is web-only: the server-rendered /admin (form actions +
// HTTP-only cookie session) over the shared core ($lib/server/admin +
// $lib/server/tokens). Nothing in the app links to it and the native bundle has
// no admin route at all — an in-app door to a privileged console reads as
// hidden functionality to a store reviewer. The JSON /api/admin/* endpoints
// remain (scripts/lib/adminClient.mjs drives them) and are covered here too.
// Token names are unique per test because the preview server's in-memory list
// is shared across the parallel workers.

async function addsAndRemovesToken(page: Page, token: string) {
  await adminConsole(page).fill(token);
  await page.getByRole('button', { name: 'Add code' }).click();
  await expect(page.getByText(`Added “${token}”`)).toBeVisible();
  // The invite row shows the raw token and exposes its prebuilt invite link
  // behind a "Copy link" action (no longer rendered as a visible URL).
  const row = page.getByRole('listitem').filter({ hasText: token });
  await expect(page.getByText(token, { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Copy link' })).toBeVisible();

  await page.getByRole('button', { name: `Remove ${token}` }).click();
  await expect(page.getByText(`Removed “${token}”`)).toBeVisible();
  await expect(page.getByText(token, { exact: true })).toBeHidden();
}

test('web /admin rejects a wrong key', async ({ page }) => {
  await page.goto('/admin');
  await submitAdminKey(page, 'wrong-key');
  await expect(page.getByRole('alert')).toContainText('Incorrect access key');
});

test('web /admin signs in via cookie session, manages tokens, signs out', async ({ page }) => {
  await signInToAdmin(page);
  // The preview server has no Netlify Blobs, so the token list is the in-memory
  // env-seeded fallback — the console must warn that edits won't persist.
  await expect(page.getByText('Netlify Blobs is unavailable')).toBeVisible();
  await addsAndRemovesToken(page, `e2e-web-${Date.now()}`);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The session survives in an HTTP-only cookie, so signing back in isn't
  // needed after a reload while signed in — but after sign-out it must be.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('web /admin surfaces a network failure instead of failing silently', async ({ page }) => {
  await signInToAdmin(page);
  await page.route(
    (url) => url.pathname === '/admin' && url.search === '?/add',
    (route) => route.abort()
  );
  await adminConsole(page).fill(`e2e-offline-${Date.now()}`);
  await page.getByRole('button', { name: 'Add code' }).click();
  // The preview server's Blobs-fallback warning is also role="alert", so pick
  // out the error flash by its text.
  await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toBeVisible();
});

test('admin API requires a valid bearer session', async ({ request }) => {
  expect((await request.get('/api/admin/tokens')).status()).toBe(401);
  expect(
    (
      await request.get('/api/admin/tokens', {
        headers: { Authorization: 'Bearer not-a-session' },
      })
    ).status()
  ).toBe(401);

  const login = await request.post('/api/admin/login', { data: { key: ADMIN_ACCESS_TOKEN } });
  expect(login.ok()).toBe(true);
  const { session } = await login.json();
  // The session is the derived HMAC, never the raw secret.
  expect(session).toMatch(/^[0-9a-f]{64}$/);
  expect(session).not.toContain(ADMIN_ACCESS_TOKEN);

  const headers = { Authorization: `Bearer ${session}` };
  const token = `e2e-api-${Date.now()}`;

  const added = await request.post('/api/admin/tokens', { headers, data: { token } });
  expect(added.ok()).toBe(true);
  const addedBody = await added.json();
  expect(addedBody.tokens).toContain(token);
  expect(addedBody.invites).toContainEqual({
    token,
    url: expect.stringContaining(`/?ai_access_token=${token}`),
  });

  const removed = await request.delete('/api/admin/tokens', { headers, data: { token } });
  expect(removed.ok()).toBe(true);
  expect((await removed.json()).tokens).not.toContain(token);
});

// /admin is function-served (prerender = false), so Netlify's static-only
// custom headers never reach it — hooks.server.ts stamps the security set on
// instead, so the credentialed console isn't the least-protected page (issue
// #470, ADR-0073). The unauthenticated login response is enough: the headers
// ride every SSR response. Asserting against the shared SECURITY_HEADERS source
// keeps this in lockstep with what the hook sends.
test('web /admin SSR response carries the site security headers', async ({ request }) => {
  const res = await request.get('/admin');
  expect(res.ok()).toBe(true);
  const headers = res.headers();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[name.toLowerCase()]).toBe(value);
  }
});
