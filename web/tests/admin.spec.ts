import { expect, test, type Page } from '@playwright/test';

// The admin console has two front doors over one shared core ($lib/server/admin
// + $lib/server/tokens): the server-rendered /admin (form actions + HTTP-only
// cookie session) and /admin/native (the static page the native apps bundle,
// which talks JSON to /api/admin/* with a bearer session). Both are exercised
// here against the same secret the Playwright web server is started with.
// Token names are unique per test because the preview server's in-memory list
// is shared across the parallel workers.

const ADMIN_KEY = 'test-admin-secret'; // set in playwright.config.ts webServer.env

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await page.getByPlaceholder('Admin access key').fill(ADMIN_KEY);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Add a code…')).toBeVisible();
}

async function addsAndRemovesToken(page: Page, token: string) {
  await page.getByPlaceholder('Add a code…').fill(token);
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
  await page.getByPlaceholder('Admin access key').fill('wrong-key');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect access key');
});

test('web /admin signs in via cookie session, manages tokens, signs out', async ({ page }) => {
  await signIn(page, '/admin');
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

test('native console /admin/native signs in via the API and manages tokens', async ({ page }) => {
  await signIn(page, '/admin/native');
  // The preview server has no Netlify Blobs, and the API snapshot carries that
  // fallback status to the native console just as the web page data does.
  await expect(page.getByText('Netlify Blobs is unavailable')).toBeVisible();
  await addsAndRemovesToken(page, `e2e-native-${Date.now()}`);

  // The bearer session persists in secure storage, so a reload stays signed in.
  await page.reload();
  await expect(page.getByPlaceholder('Add a code…')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('native console updates persistence status from every API snapshot', async ({ page }) => {
  const token = `e2e-native-persistent-${Date.now()}`;
  await page.route('**/api/admin/tokens', async (route) => {
    const isInitialSnapshot = route.request().method() === 'GET';
    await route.fulfill({
      json: {
        ok: true,
        tokens: isInitialSnapshot ? [] : [token],
        invites: isInitialSnapshot
          ? []
          : [{ token, url: `http://localhost:4173/?ai_access_token=${token}` }],
        persistent: isInitialSnapshot,
      },
    });
  });

  await signIn(page, '/admin/native');
  await expect(page.getByText('Netlify Blobs is unavailable')).toBeHidden();

  await page.getByPlaceholder('Add a code…').fill(token);
  await page.getByRole('button', { name: 'Add code' }).click();
  await expect(page.getByText('Netlify Blobs is unavailable')).toBeVisible();
});

test('web /admin surfaces a network failure instead of failing silently', async ({ page }) => {
  await signIn(page, '/admin');
  await page.route(
    (url) => url.pathname === '/admin' && url.search === '?/add',
    (route) => route.abort()
  );
  await page.getByPlaceholder('Add a code…').fill(`e2e-offline-${Date.now()}`);
  await page.getByRole('button', { name: 'Add code' }).click();
  // The preview server's Blobs-fallback warning is also role="alert", so pick
  // out the error flash by its text.
  await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toBeVisible();
});

test('native console reports a failed post-login snapshot and recovers on reload', async ({
  page,
}) => {
  await page.goto('/admin/native');
  // Let the login POST through but kill the follow-up tokens GET: the session
  // is already saved by then, so the login card must say what went wrong…
  await page.route('**/api/admin/tokens', (route) => route.abort());
  await page.getByPlaceholder('Admin access key').fill(ADMIN_KEY);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not reach the server');

  // …and once the network is back, a reload signs in from the stored session.
  await page.unroute('**/api/admin/tokens');
  await page.reload();
  await expect(page.getByPlaceholder('Add a code…')).toBeVisible();
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

  const login = await request.post('/api/admin/login', { data: { key: ADMIN_KEY } });
  expect(login.ok()).toBe(true);
  const { session } = await login.json();
  // The session is the derived HMAC, never the raw secret.
  expect(session).toMatch(/^[0-9a-f]{64}$/);
  expect(session).not.toContain(ADMIN_KEY);

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
